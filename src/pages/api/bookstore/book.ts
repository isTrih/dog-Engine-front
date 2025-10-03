
import type { NextApiRequest, NextApiResponse } from 'next';
import type { BookstoreBookDetail } from '@/lib/types';
import { decodeCoverIfNeeded } from '@/lib/book-source-utils';
import { getCookieForUrl } from '@/lib/book-source-auth';
import { rewriteViaProxyBase } from '@/lib/proxy-fetch';
import * as cheerio from 'cheerio';
import { getBookSources, parseWithRules, parseListWithRules, evaluateJs, parseRuleWithCssJs } from '@/lib/book-source-utils';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const { url, sourceId } = req.query;
    const logPrefix = '[API/bookstore/book]';

    console.log(`${logPrefix} Received book detail request: url=${url}, sourceId=${sourceId}`);

    if (typeof url !== 'string' || !url) {
        return res.status(400).json({ success: false, error: 'URL is required' });
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
        
        const bookInfoRule = source.rules?.bookInfo;
        const tocRule = source.rules?.toc;

        if (!bookInfoRule || !tocRule) {
            console.error(`${logPrefix} Source '${source.name}' is missing bookInfo or toc rules.`);
            return res.status(501).json({ success: false, error: `Book source '${source.name}' is missing parsing rules for book details or table of contents.` });
        }
        
        let detailUrl = url;
        let requestOptions: RequestInit = { headers: source.header ? JSON.parse(source.header) : undefined };

        if (url.includes(',')) { // Complex URL with options
            const parts = url.split(',');
            detailUrl = parts[0];
            if (parts[1]) {
                try {
                    const options = JSON.parse(parts[1]);
                    requestOptions = {
                        method: options.method || 'GET',
                        headers: { ...requestOptions.headers, ...options.headers },
                        body: options.body
                    };
                } catch(e) {
                    console.error(`${logPrefix} Failed to parse request options from URL:`, e);
                }
            }
        }
        
        // Inject cookies if available for this source and URL
        const cookieHeader = await getCookieForUrl(source.id, detailUrl);
        const mergedHeaders: Record<string, string> = {
            ...(requestOptions.headers as any),
            ...(cookieHeader ? { cookie: cookieHeader } : {}),
        };
        const response = await fetch(rewriteViaProxyBase(detailUrl, source.proxyBase), { ...requestOptions, headers: mergedHeaders });
        console.log(`${logPrefix} Fetched with status: ${response.status}`);
        if (!response.ok) {
            throw new Error(`Failed to fetch book detail from ${detailUrl}. Status: ${response.status}`);
        }
        const html = await response.text();
        
        let initResult: any;
        try {
            initResult = JSON.parse(html);
        } catch (e) {
            initResult = html;
        }

        if (bookInfoRule.init?.startsWith('$.')) {
            const keys = bookInfoRule.init.substring(2).split('.');
            let value = initResult;
            for(const key of keys) {
                if(value && typeof value === 'object' && key in value) value = value[key];
                else { value = undefined; break; }
            }
            initResult = value;
            console.log(`${logPrefix} Ran init rule, result is now:`, typeof initResult);
        }
        
        const tocUrlRaw = bookInfoRule.tocUrl || '';
        // tocUrl可能包含@js:，需要先提取CSS选择器部分
        let tocUrlToEvaluate = tocUrlRaw;
        if (tocUrlRaw.includes('\n@js:') || tocUrlRaw.includes('@js:')) {
            // 分离CSS选择器和JS代码
            const jsIndex = tocUrlRaw.indexOf('@js:');
            if (jsIndex > -1) {
                // 先提取CSS选择器部分的值
                const selectorPart = tocUrlRaw.substring(0, jsIndex).trim();
                const extractedUrl = parseWithRules(html, selectorPart, detailUrl);
                
                // 然后用JS代码处理，注意：JS中的baseUrl指的是当前页面URL
                const jsPart = '<js>\nvar baseUrl = "' + detailUrl + '";\n' + tocUrlRaw.substring(jsIndex + 4) + '\n</js>';
                tocUrlToEvaluate = await evaluateJs(jsPart, { source, result: extractedUrl, key: url });
                console.log(`${logPrefix} ToC URL (CSS+JS处理): ${tocUrlToEvaluate}`);
            }
        } else {
            tocUrlToEvaluate = await evaluateJs(tocUrlRaw, { source, result: initResult, key: url });
        }
        
        const evaluatedTocUrl = tocUrlToEvaluate;
        console.log(`${logPrefix} Final ToC URL: ${evaluatedTocUrl}`);
        
        let tocHtml = html;
        let tocResponseUrl = detailUrl;

        if (evaluatedTocUrl && evaluatedTocUrl !== detailUrl) {
            let tocRequestOptions: RequestInit = { headers: source.header ? JSON.parse(source.header) : undefined };
            let finalTocUrl = evaluatedTocUrl;

            // 处理URL,options格式（大灰狼书源用）
            if (evaluatedTocUrl.includes(',{')) {
                const commaIndex = evaluatedTocUrl.indexOf(',{');
                finalTocUrl = evaluatedTocUrl.substring(0, commaIndex);
                try {
                    const options = JSON.parse(evaluatedTocUrl.substring(commaIndex + 1));
                    tocRequestOptions = {
                        method: options.method || 'GET',
                        headers: { ...tocRequestOptions.headers, ...options.headers },
                        body: options.body
                    }
                } catch (e) {
                    console.warn(`${logPrefix} 无法解析ToC请求选项，使用默认配置`);
                }
            }
            
            tocResponseUrl = finalTocUrl;
            console.log(`${logPrefix} Fetching ToC from URL: ${finalTocUrl}`);
            const tocCookie = await getCookieForUrl(source.id, finalTocUrl);
            const tocMergedHeaders: Record<string, string> = {
                ...(tocRequestOptions.headers as any),
                ...(tocCookie ? { cookie: tocCookie } : {}),
            };
            const tocResponse = await fetch(rewriteViaProxyBase(finalTocUrl, source.proxyBase), { ...tocRequestOptions, headers: tocMergedHeaders });
            console.log(`${logPrefix} Fetched ToC with status: ${tocResponse.status}`);
             if(tocResponse.ok) {
                tocHtml = await tocResponse.text();
             }
        }
        
        let tocResult: any;
        try {
            tocResult = JSON.parse(tocHtml);
        } catch (e) {
            tocResult = tocHtml;
        }
        
        // 处理chapterList规则（可能包含@css:和@js:）
        let chapters: any[] = [];
        // preUpdateJs: 在目录解析前执行，允许站点对 tocHtml 做改写
        const preUpdateJs = source.rules?.toc?.preUpdateJs;
        if (preUpdateJs && preUpdateJs.startsWith('<js>')) {
            try {
                const modified = await evaluateJs(preUpdateJs, { source, result: tocHtml });
                if (typeof modified === 'string' && modified.length > 0) {
                    tocHtml = modified;
                }
            } catch (e) {
                console.warn(`${logPrefix} preUpdateJs 执行失败，继续使用原始HTML`);
            }
        }
        if (tocRule.chapterList && (tocRule.chapterList.includes('@css:') || tocRule.chapterList.includes('@js:'))) {
            // 使用专门的@css:+@js:解析器
            console.log(`${logPrefix} ChapterList包含@css/@js规则，使用特殊解析器`);
            const chapterListResult = await parseRuleWithCssJs(tocHtml, tocRule.chapterList, tocResponseUrl, source);
            
            if (Array.isArray(chapterListResult)) {
                // JS返回的已经是处理好的数组
                chapters = chapterListResult.map((item: any) => ({
                    title: item[tocRule.chapterName || 'text'] || item.text,
                    url: item[tocRule.chapterUrl || 'href'] || item.href,
                }));
            } else {
                console.warn(`${logPrefix} @css/@js解析器未返回数组`);
            }
        } else {
            // 使用常规解析器
            chapters = parseListWithRules(tocHtml, tocRule.chapterList, {
                title: tocRule.chapterName,
                url: tocRule.chapterUrl,
            }, tocResponseUrl);
        }
        
        chapters = await Promise.all(chapters.map(async (chapter) => {
            if (chapter.url && chapter.url.startsWith('<js>')) {
                chapter.url = await evaluateJs(chapter.url, { source, result: chapter, key: chapter.title });
            }
            return chapter;
        }));

        // 过滤无效章节（没有有效URL或标题的，如卷分隔项）并去重
        const seen = new Set<string>();
        chapters = chapters.filter((ch) => {
            const hasUrl = typeof ch?.url === 'string' && ch.url.trim().length > 0;
            const hasTitle = typeof ch?.title === 'string' && ch.title.trim().length > 0;
            if (!hasUrl || !hasTitle) return false;
            const key = ch.url.trim();
            if (seen.has(key)) return false;
            seen.add(key);
            return true;
        });

        // formatJs: 目录解析完成后的格式化
        const formatJs = source.rules?.toc?.formatJs;
        if (formatJs && formatJs.startsWith('<js>')) {
            try {
                const formatted = await evaluateJs(formatJs, { source, result: JSON.stringify(chapters) });
                try {
                    const arr = JSON.parse(formatted);
                    if (Array.isArray(arr)) chapters = arr;
                } catch {
                    // 如果返回的不是JSON数组则忽略
                }
            } catch (e) {
                console.warn(`${logPrefix} formatJs 执行失败，忽略`);
            }
        }

        console.log(`${logPrefix} Found ${chapters.length} chapters.`);
        
        const bookDataContainer = bookInfoRule.init?.startsWith('$.') ? initResult : html;

        // 生成并清洗简介（支持HTML，去掉危险标签与属性）
        const rawDescription = bookInfoRule.intro?.startsWith('<js>') 
            ? await evaluateJs(bookInfoRule.intro, {source, result: initResult}) 
            : parseWithRules(bookDataContainer, bookInfoRule.intro, detailUrl);

        const sanitizeIntroHtml = (input: string): string => {
            if (!input || typeof input !== 'string') return '';
            try {
                const $ = cheerio.load(input, { decodeEntities: false });
                // remove dangerous nodes
                $('script, style, noscript, iframe, object, embed').remove();
                const allowed = new Set(['p','br','strong','em','b','i','ul','ol','li','span','div','a']);
                $('*').each((_i, el) => {
                    const tag = (el as any).tagName ? String((el as any).tagName).toLowerCase() : '';
                    if (!allowed.has(tag)) {
                        $(el).replaceWith($(el).text());
                        return;
                    }
                    // keep only safe attributes
                    const attribs = (el as any).attribs || {};
                    for (const attr of Object.keys(attribs)) {
                        if (!(tag === 'a' && attr === 'href')) {
                            $(el).removeAttr(attr);
                        }
                    }
                });
                // unwrap empty divs
                $('div').each((_i, el) => {
                    if (!$(el).children().length && $(el).text().trim().length === 0) {
                        $(el).remove();
                    }
                });
                return $.root().html() || '';
            } catch {
                return input;
            }
        };

        // 书名主解析
        let parsedTitle = parseWithRules(bookDataContainer, bookInfoRule.name, detailUrl);
        if (!parsedTitle || parsedTitle.trim().length === 0) {
            try {
                // 回退1：尝试从 <title> 提取（去站点名等杂项）
                const $ = cheerio.load(typeof html === 'string' ? html : '');
                const rawTitle = ($('title').first().text() || '').trim();
                parsedTitle = rawTitle.replace(/[《》\-_|｜]|(最新章节.*$)/g, '').trim();
            } catch {}
        }
        if (!parsedTitle || parsedTitle.trim().length === 0) {
            // 回退2：使用URL末段（去掉扩展名和参数）
            try {
                const u = new URL(detailUrl);
                const last = decodeURIComponent(u.pathname.split('/').filter(Boolean).pop() || '');
                parsedTitle = last.replace(/\.(html?|php|aspx)$/i, '').replace(/[-_]/g, ' ').trim();
            } catch {}
        }

        const bookDetail: BookstoreBookDetail = {
            title: parsedTitle || '',
            author: parseWithRules(bookDataContainer, bookInfoRule.author, detailUrl),
            cover: (await decodeCoverIfNeeded(parseWithRules(bookDataContainer, bookInfoRule.coverUrl, detailUrl), source)) || parseWithRules(bookDataContainer, bookInfoRule.coverUrl, detailUrl),
            description: sanitizeIntroHtml(rawDescription),
            category: parseWithRules(bookDataContainer, bookInfoRule.kind, detailUrl),
            latestChapter: parseWithRules(bookDataContainer, bookInfoRule.lastChapter, detailUrl),
            detailUrl: detailUrl,
            chapters: chapters,
        };
        
        console.log(`${logPrefix} Successfully parsed book detail: ${bookDetail.title}`);
        res.status(200).json({ success: true, book: bookDetail });

    } catch (error: any) {
        console.error(logPrefix, error);
        res.status(500).json({ success: false, error: 'Failed to fetch book details', details: error.message });
    }
}
