import { getMetaApiPath } from 'src/control/core/dom/meta/getMetaApiPath';
import type { BlocMeta, SnippetItem, TemplateItem } from './types';
import resolveApiUrl from 'src/control/core/dom/meta/resolveApiUrl';
import type { BlocListItemResponse } from 'src/socle/interfaces/CmsRepository';

async function fetchJson<T>(path: string, fallback: T): Promise<T> {
    try {
        const res = await fetch(resolveApiUrl(path));
        if (!res.ok) return fallback;
        return await res.json() as T;
    } catch(e) {
        console.log(e);
        return fallback;
    }
}

export const fetchTemplates = () => fetchJson<TemplateItem[]>('template/list', []);
export const fetchSnippets = () => fetchJson<SnippetItem[]>('snippet/list', []);

/**
 * Lazy companion to `fetchTemplates`: the list endpoint stays narrow
 * (id/name/category/createdAt — no `content`) for cheap library renders;
 * this is called only when the user actually picks a template card and
 * we need its HTML to insert into the editor.
 */
export const fetchTemplateContent = async (id: string): Promise<string> => {
    try {
        const res = await fetch(resolveApiUrl(`template?id=${encodeURIComponent(id)}`));
        if (!res.ok) return '';
        const tpl = await res.json() as { content?: string };
        return tpl.content ?? '';
    } catch (e) {
        console.log(e);
        return '';
    }
};

export async function fetchBlocMeta(): Promise<Map<string, BlocMeta>> {
    const list = await fetchJson<BlocListItemResponse[]>('bloc/list', []);
    return new Map(list.map(b => [b.id, { description: b.description }]));
}
