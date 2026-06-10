import InvalidParam from 'cms-control/errors/Http/InvalidParam';
import { hardenStoredHtml } from "@bernouy/cms-content";

const MAX_CONTENT = 5_000_000;

export const DEFAULT_SNIPPET_CONTENT = '<p></p>';

export function sanitizeSnippetContent(value: unknown): string {
    if (value == null) return DEFAULT_SNIPPET_CONTENT;
    if (typeof value !== 'string') throw new InvalidParam('content', 'Must be a string.');
    if (value.length > MAX_CONTENT) throw new InvalidParam('content', `Max ${MAX_CONTENT} chars.`);
    if (value.trim().length === 0) return DEFAULT_SNIPPET_CONTENT;
    return hardenStoredHtml(value);
}
