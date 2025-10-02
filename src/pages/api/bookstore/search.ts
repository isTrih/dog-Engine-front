
import type { NextApiRequest, NextApiResponse } from 'next';
import type { BookstoreBook } from '@/lib/types';
import { getBookSources, parseListWithRules, evaluateJs, decodeCoverIfNeeded } from '@/lib/book-source-utils';
import { getCookieForUrl } from '@/lib/book-source-auth';
import { rewriteViaProxyBase } from '@/lib/proxy-fetch';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const { q, sourceId, page = '1' } = req.query;
    const logPrefix = '[API/bookstore/search]';

    console.log(`${logPrefix} Received search request: q=${q}, sourceId=${sourceId}`);

    if (typeof q !== 'string' || !q) {
        return res.status(400).json({ success: false, error: 'Search query is required' });
    }
    if (typeof sourceId !== 'string' || !sourceId) {
        return res.status(400).json({ success: false, error: 'sourceId is required' });
    }

    try {
        const sources = await getBookSources();
        const source = sources.find(s => s.id === sourceId);

        if (!source || !source.enabled) {
            console.error(`${logPrefix} Source not found or disabled for ID: ${sourceId}`);
            return res.status(404).json({ success: false, error: `Book source with ID ${sourceId} not found or is disabled.` });
        }
        
        console.log(`${logPrefix} Using source: ${source.name}`);
        console.log(`${logPrefix} Source URL: ${source.url}`);
        console.log(`${logPrefix} Search URL template: ${source.searchUrl}`);

        const searchRule = source.rules?.search;
        if (!searchRule) {
            console.error(`${logPrefix} Source '${source.name}' is missing search rules.`);
            return res.status(501).json({ success: false, error: `Book source '${source.name}' is missing parsing rules for search results.` });
        }
        
        const searchUrlTemplate = source.searchUrl || '';
        if (!searchUrlTemplate) {
            console.error(`${logPrefix} Source '${source.name}' has no searchUrl configured.`);
            return res.status(501).json({ success: false, error: `Book source '${source.name}' has no search URL configured.` });
        }
        
        let searchUrl = await evaluateJs(searchUrlTemplate, { key: q, page: parseInt(page as string), source });
        searchUrl = rewriteViaProxyBase(searchUrl, source.proxyBase);
        
        console.log(`${logPrefix} Evaluated search URL (before processing): ${searchUrl}`);

        if (!searchUrl) {
            return res.status(400).json({ success: false, error: `Failed to parse URL from ${searchUrlTemplate}` });
        }
        
        // 处理相对路径：如果不是完整URL，需要拼接base URL
        if (!searchUrl.startsWith('http://') && !searchUrl.startsWith('https://')) {
            // 检查source.url是否是有效的HTTP URL
            if (source.url.startsWith('http://') || source.url.startsWith('https://')) {
                const baseUrl = source.url.replace(/\/$/, ''); // 移除末尾的斜杠
                searchUrl = baseUrl + (searchUrl.startsWith('/') ? searchUrl : '/' + searchUrl);
            } else {
                // source.url不是HTTP URL，这可能是书源配置错误
                console.error(`${logPrefix} Invalid source URL: ${source.url}, and search URL is relative: ${searchUrl}`);
                return res.status(400).json({ 
                    success: false, 
                    error: `书源配置错误：source.url不是有效的HTTP地址（${source.url}），且搜索URL是相对路径（${searchUrl}）。请检查书源的searchUrl配置，确保它返回完整的HTTP URL。` 
                });
            }
        }
        
        console.log(`${logPrefix} Final search URL: ${searchUrl}`);
        
        // merge cookie header if stored for this source
        const cookieHeader = await getCookieForUrl(source.id, searchUrl);
        const baseHeaders: Record<string, string> = (() => {
            try { return source.header ? JSON.parse(source.header) : {}; } catch { return {}; }
        })();
        const mergedHeaders: Record<string, string> = {
            ...baseHeaders,
            ...(cookieHeader ? { cookie: cookieHeader } : {}),
        };
        let response: Response;
        try {
            response = await fetch(searchUrl, { headers: mergedHeaders });
        } catch (e: any) {
            console.warn(`${logPrefix} Direct fetch failed (${e?.code || e?.message}), trying proxy...`);
            // 若外网直连被阻断，尝试通过我们已有的 /api/test-proxy 代理中转（若已配置）
            try {
                const proxied = await fetch(`/api/test-proxy?url=${encodeURIComponent(searchUrl)}`);
                if (!proxied.ok) throw new Error('proxy failed');
                const text = await proxied.text();
                response = new Response(text, { status: 200 });
            } catch {
                throw e; // 保留原始错误
            }
        }
        console.log(`${logPrefix} Fetched ${searchUrl} with status: ${response.status}`);
        if (!response.ok) {
            throw new Error(`Failed to fetch search results from ${searchUrl}. Status: ${response.status}`);
        }
        const responseText = await response.text();
        
        // 尝试解析为JSON查看结构
        try {
            const jsonResponse = JSON.parse(responseText);
            console.log(`${logPrefix} API返回的JSON结构:`, JSON.stringify({
                hasData: !!jsonResponse.data,
                dataLength: Array.isArray(jsonResponse.data) ? jsonResponse.data.length : 'not array',
                dataType: typeof jsonResponse.data,
                firstItem: Array.isArray(jsonResponse.data) && jsonResponse.data.length > 0 ? jsonResponse.data[0] : null
            }, null, 2));
        } catch (e) {
            console.log(`${logPrefix} 响应不是JSON格式，HTML长度: ${responseText.length}`);
        }

        const itemRules = {
            title: searchRule.name,
            author: searchRule.author,
            cover: searchRule.coverUrl,
            detailUrl: searchRule.bookUrl,
            category: searchRule.kind,
            latestChapter: searchRule.lastChapter,
            intro: searchRule.intro,
        };

        const booksRaw = parseListWithRules(responseText, searchRule.bookList, itemRules, searchUrl);
        const books: BookstoreBook[] = booksRaw.map(book => ({...book, sourceId}));
        
        console.log(`${logPrefix} Found ${books.length} books initially.`);
        
        // 调试：显示前3本书的原始数据
        if (books.length > 0) {
            console.log(`${logPrefix} 第一本书原始数据:`, JSON.stringify(books[0], null, 2));
        }
        
        // Post-process with JS if needed
        const processedBooks = await Promise.all(books.map(async (book, index) => {
            if (book.detailUrl && book.detailUrl.startsWith('<js>')) {
                console.log(`${logPrefix} 处理第 ${index + 1} 本书的 detailUrl JS脚本`);
                book.detailUrl = await evaluateJs(book.detailUrl, { source, result: book });
                console.log(`${logPrefix} 第 ${index + 1} 本书处理后 detailUrl: ${book.detailUrl}`);
            }
            book.cover = await decodeCoverIfNeeded(book.cover, source) || book.cover;
            return book;
        }));

        console.log(`${logPrefix} Search successful. Returning ${processedBooks.length} books.`);
        
        // 调试：显示最终返回的第一本书
        if (processedBooks.length > 0) {
            console.log(`${logPrefix} 第一本书最终数据:`, JSON.stringify(processedBooks[0], null, 2));
        }
        
        res.status(200).json({ success: true, books: processedBooks });

    } catch (error: any) {
        console.error(logPrefix, error);
        res.status(500).json({ success: false, error: 'Search failed', details: error.message });
    }
}
