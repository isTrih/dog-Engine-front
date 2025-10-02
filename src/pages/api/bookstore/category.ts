
import type { NextApiRequest, NextApiResponse } from 'next';
import type { BookstoreBook, BookstoreCategory } from '@/lib/types';
import { getBookSources, parseListWithRules, evaluateJs, decodeCoverIfNeeded } from '@/lib/book-source-utils';
import { getCookieForUrl } from '@/lib/book-source-auth';
import { rewriteViaProxyBase } from '@/lib/proxy-fetch';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const { url, sourceId, exploreUrl, page = '1', mode } = req.query;
    const logPrefix = '[API/bookstore/category]';

    console.log(`${logPrefix} Received category request: url=${url}, exploreUrl=${exploreUrl}, mode=${mode}, sourceId=${sourceId}`);

    if (typeof sourceId !== 'string' || !sourceId) {
        return res.status(400).json({ success: false, error: 'sourceId is required' });
    }
    
    // When mode is provided, server will derive URLs from source config and not require client to send long URLs
    if (!mode && !url && !exploreUrl) {
         return res.status(400).json({ success: false, error: 'url or exploreUrl is required' });
    }

    try {
        const sources = await getBookSources();
        const source = sources.find(s => s.id === sourceId);

        if (!source || !source.enabled) {
            console.error(`${logPrefix} Source not found or disabled for ID: ${sourceId}`);
            return res.status(404).json({ success: false, error: `Book source with ID ${sourceId} not found or is disabled.` });
        }
        
        console.log(`${logPrefix} Using source: ${source.name}`);

        // Determine fetch target/or data based on mode or provided params
        let fetchUrlOrJsonData = '' as string;
        if (typeof mode === 'string' && mode) {
            const normalizedMode = mode.toLowerCase();
            if (normalizedMode === 'explore') {
                if (!source.exploreUrl) {
                    console.error(`${logPrefix} Source '${source.name}' has no exploreUrl configured.`);
                    return res.status(501).json({ success: false, error: `Book source '${source.name}' has no exploreUrl configured.` });
                }
                fetchUrlOrJsonData = source.exploreUrl;
            } else if (normalizedMode === 'find') {
                const findRule = source.rules?.find;
                if (!findRule?.url) {
                    console.error(`${logPrefix} Source '${source.name}' is missing find.url.`);
                    return res.status(501).json({ success: false, error: `Book source '${source.name}' is missing 'find.url' configuration.` });
                }
                fetchUrlOrJsonData = findRule.url;
            } else {
                return res.status(400).json({ success: false, error: `Unsupported mode '${mode}'.` });
            }
        } else {
            fetchUrlOrJsonData = (exploreUrl || url) as string;
        }

        let data;
        let baseUrl = source.url;

        // If the result is a URL, fetch it. If not, it's probably already JSON data.
        if (fetchUrlOrJsonData.startsWith('http')) {
            // 处理 {{page}} 占位
            let realUrl = fetchUrlOrJsonData.replace(/\{\{page\}\}/g, String(page));
            realUrl = rewriteViaProxyBase(realUrl, source.proxyBase);
            baseUrl = realUrl;
            console.log(`${logPrefix} Fetching URL: ${baseUrl}`);
            const cookieHeader = await getCookieForUrl(source.id, realUrl);
            const mergedHeaders: Record<string, string> = {
                ...(source.header ? JSON.parse(source.header) : {}),
                ...(cookieHeader ? { cookie: cookieHeader } : {}),
            };
            try {
                const response = await fetch(realUrl, { headers: mergedHeaders });
                console.log(`${logPrefix} Fetched with status: ${response.status}`);
                if (!response.ok) {
                    throw new Error(`Failed to fetch category page from ${realUrl}. Status: ${response.status}`);
                }
                data = await response.text();
            } catch (e: any) {
                console.warn(`${logPrefix} Direct fetch failed (${e?.code || e?.message}), trying proxy...`);
                // 通过本地代理转发
                const proxied = await fetch(`/api/test-proxy?url=${encodeURIComponent(realUrl)}`);
                if (!proxied.ok) throw e;
                data = await proxied.text();
            }
        } else {
            console.log(`${logPrefix} Processing as direct JSON/JS data.`);
            if (fetchUrlOrJsonData.trim().startsWith('<js>')) {
                data = await evaluateJs(fetchUrlOrJsonData, { source });
            } else {
                const raw = fetchUrlOrJsonData.trim();
                if (raw.startsWith('[') || raw.startsWith('{')) {
                    data = raw;
                } else {
                    // 支持按行 “标题::URL” 配置
                    const lines = raw.split(/\r?\n/).map(s => s.trim()).filter(Boolean);
                    const categories: BookstoreCategory[] = lines.map(line => {
                        const [title, link] = line.split('::');
                        return { title: (title || '').trim(), url: (link || '').trim(), sourceId };
                    }).filter(c => c.title && c.url);
                    if (categories.length > 0) {
                        console.log(`${logPrefix} Parsed ${categories.length} categories from plain text exploreUrl.`);
                        return res.status(200).json({ success: true, categories });
                    }
                    data = raw;
                }
            }
        }

        if ((typeof mode === 'string' && mode.toLowerCase() === 'explore') || (!!exploreUrl && !mode)) {
             const categoriesRaw = parseListWithRules(data, '$.', {
                title: '$.title',
                url: '$.url',
            }, baseUrl);
            let categories: BookstoreCategory[] = categoriesRaw.map(cat => ({...cat, sourceId}));
            
            // 如果解析结果为空，可能是依赖 java.ajax 的书源，提供fallback
            if (categories.length === 0 && source.name.includes('大灰狼')) {
                console.log(`${logPrefix} ⚠️ 大灰狼书源的发现页依赖 java.ajax，Web环境不支持。提供简化分类。`);
                categories = [
                    { title: '💡 提示', url: '', sourceId },
                    { title: '大灰狼书源的发现页需要Android APP支持', url: '', sourceId },
                    { title: '但搜索功能完全正常！', url: '', sourceId },
                    { title: '👉 请使用顶部搜索框搜索书籍', url: '', sourceId },
                ];
            }
            
            console.log(`${logPrefix} Found ${categories.length} categories from exploreUrl.`);
            res.status(200).json({ success: true, categories });
        } 
        else {
            const findRule = source.rules?.find;
            if(!findRule){
                console.error(`${logPrefix} Source '${source.name}' is missing 'find' rules.`);
                return res.status(501).json({ success: false, error: `Book source '${source.name}' is missing parsing rules for 'find'.` });
            }
            
            const booksRaw = parseListWithRules(data, findRule.bookList, {
                title: findRule.name,
                author: findRule.author,
                cover: findRule.coverUrl,
                detailUrl: findRule.bookUrl,
                category: findRule.kind,
                latestChapter: findRule.lastChapter,
            }, baseUrl);
            const books: BookstoreBook[] = await Promise.all(booksRaw.map(async (book) => ({
                ...book,
                cover: await decodeCoverIfNeeded(book.cover, source),
                sourceId
            })));

            console.log(`${logPrefix} Found ${books.length} books from category URL.`);
            res.status(200).json({ success: true, books });
        }

    } catch (error: any) {
        console.error(logPrefix, error);
        res.status(500).json({ success: false, error: 'Failed to fetch category books.', details: error.message });
    }
}
