
import type { NextApiRequest, NextApiResponse } from 'next';
import type { BookstoreChapterContent } from '@/lib/types';
import { getBookSources, parseWithRules, evaluateJs } from '@/lib/book-source-utils';
import { getCookieForUrl } from '@/lib/book-source-auth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
    const { url, sourceId } = req.query;
    const logPrefix = '[API/bookstore/chapter]';

    console.log(`${logPrefix} Received chapter request: url=${url}, sourceId=${sourceId}`);

    if (typeof url !== 'string' || !url) {
        return res.status(400).json({ success: false, error: 'Chapter URL is required' });
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
        
        const contentRule = source.rules?.content;
        if(!contentRule){
             console.error(`${logPrefix} Source '${source.name}' is missing content rules.`);
             return res.status(501).json({ success: false, error: `Book source '${source.name}' is missing parsing rules for chapter content.` });
        }

        let chapterUrl = url;
        let requestHeaders: Record<string, string> = {};
        if (source.header) {
            try {
                requestHeaders = JSON.parse(source.header);
            } catch (e) {
                console.warn(`${logPrefix} Failed to parse source.header as JSON, checking for JS code...`);
                if (source.header.trim().startsWith('<js>') && source.header.trim().endsWith('</js>')) {
                    try {
                        const headerResult = await evaluateJs(source.header, { source });
                        requestHeaders = JSON.parse(headerResult);
                    } catch (jsError) {
                        console.error(`${logPrefix} Failed to evaluate header JS:`, jsError);
                        requestHeaders = {};
                    }
                }
            }
        }
        let requestOptions: RequestInit = { headers: requestHeaders };
        let jsContextResult: any = {};
        
        if (url.startsWith('data:')) {
            const parts = url.split(',');
            const encoded = parts[1];
            const decoded = Buffer.from(encoded, 'base64').toString('utf-8');
             
            if (parts.length > 2 && parts[2].startsWith('{')) {
                jsContextResult = JSON.parse(parts[2]);
            }
            
            // The decoded part is the actual JS to run
            chapterUrl = await evaluateJs(`<js>${decoded}</js>`, { source, result: jsContextResult });
            console.log(`${logPrefix} Evaluated data URL to: ${chapterUrl}`);

        } else if (url.startsWith('<js>')) {
            chapterUrl = await evaluateJs(url, { source });
            console.log(`${logPrefix} Evaluated JS URL to: ${chapterUrl}`);
        }

        if (chapterUrl.includes(',')) {
            const parts = chapterUrl.split(',');
            chapterUrl = parts[0];
             if (parts[1]) {
                try {
                    const options = JSON.parse(parts[1]);
                    requestOptions = {
                        method: options.method || 'GET',
                        headers: { ...requestOptions.headers, ...options.headers },
                        body: options.body
                    };
                } catch(e) {
                     console.error(`${logPrefix} Failed to parse request options from chapter URL:`, e);
                }
            }
        }
        
        console.log(`${logPrefix} Fetching chapter content from: ${chapterUrl}`);
        const cookieHeader = await getCookieForUrl(source.id, chapterUrl);
        const mergedHeaders: Record<string, string> = {
            ...(requestOptions.headers as any),
            ...(cookieHeader ? { cookie: cookieHeader } : {}),
        };
        const response = await fetch(chapterUrl, { ...requestOptions, headers: mergedHeaders });
        console.log(`${logPrefix} Fetched with status: ${response.status}`);
        if (!response.ok) {
            throw new Error(`Failed to fetch chapter content from ${chapterUrl}. Status: ${response.status}`);
        }
        const html = await response.text();

        let content = '';
        
        let contentContainer: any = html;
         try {
            contentContainer = JSON.parse(html);
        } catch (e) {
            // Not JSON, it's fine
        }

        if (contentRule.content.startsWith('<js>')) {
             console.log(`${logPrefix} Evaluating content rule with JS.`);
             content = await evaluateJs(contentRule.content, { source, result: html });
             try {
                // If the result of JS is a JSON string, parse it.
                const parsedContent = JSON.parse(content);
                if(parsedContent.content) {
                    content = parsedContent.content;
                }
             } catch(e) { /* Not a JSON string, use as is */ }

        } else if (contentRule.content.startsWith('$.')) {
             console.log(`${logPrefix} Evaluating content rule with JSON path: ${contentRule.content}`);
             const keys = contentRule.content.substring(2).split('.');
             let value: any = contentContainer;
             for (const key of keys) {
                 if (value && typeof value === 'object' && key in value) value = value[key];
                 else { value = undefined; break; }
             }
             content = value || '';
        } else {
            console.log(`${logPrefix} Evaluating content rule with CSS selector: ${contentRule.content}`);
            content = parseWithRules(html, contentRule.content, chapterUrl);
        }

        // 替换/清洗
        const sourceRegex = contentRule.sourceRegex;
        const replaceRegex = contentRule.replaceRegex;
        if (replaceRegex && replaceRegex.startsWith('@js:')) {
            try {
                const replaced = await evaluateJs('<js>' + replaceRegex.substring(4) + '</js>', { source, result: content });
                if (typeof replaced === 'string' && replaced.length > 0) {
                    content = replaced;
                }
            } catch (e) {
                // ignore
            }
        } else if (replaceRegex) {
            try {
                const reg = new RegExp(replaceRegex, 'g');
                content = content.replace(reg, '');
            } catch {}
        } else {
            // no replaceRegex
        }

        // 统一规范化：换行、空白、去标签
        content = content
            .replace(/&nbsp;/gi, ' ')
            .replace(/<br\s*\/?\s*>/gi, '\n')
            .replace(/<p\b[^>]*>/gi, '')
            .replace(/<\/p>/gi, '\n\n')
            .replace(/<[^>]+>/g, '')
            .split('\n')
            .map(line => line.replace(/\s+/g, ' ').trim())
            .filter(line => line.length > 0)
            .join('\n\n');

        if (sourceRegex) {
            try {
                const reg = new RegExp(sourceRegex, 'g');
                content = content.replace(reg, '');
            } catch {}
        }
        
        console.log(`${logPrefix} Successfully parsed content.`);

        const chapterTitle = parseWithRules(html, contentRule.chapterName, chapterUrl) || parseWithRules(html, 'title', chapterUrl);
        
        // 处理下一页链接：支持 JS/CSS/JSON 规则
        let nextUrl: string | undefined = undefined;
        if (contentRule.nextContentUrl) {
            if (contentRule.nextContentUrl.startsWith('<js>')) {
                nextUrl = await evaluateJs(contentRule.nextContentUrl, { source, result: html });
            } else {
                // 使用常规规则解析（支持 id./class./text.@href 等）
                nextUrl = parseWithRules(html, contentRule.nextContentUrl, chapterUrl);
            }
        }

        const chapterContent: BookstoreChapterContent = {
            title: chapterTitle,
            content,
            nextChapterUrl: nextUrl,
            prevChapterUrl: undefined, // Note: prevChapterUrl is not part of the spec, would require more logic
        };
        
        console.log(`${logPrefix} Returning chapter: ${chapterContent.title}`);
        res.status(200).json({ success: true, chapter: chapterContent });

    } catch (error: any) {
        console.error(logPrefix, error);
        res.status(500).json({ success: false, error: 'Failed to fetch chapter content.', details: error.message });
    }
}
