import InvalidParam from 'cms-control/errors/Http/InvalidParam';
import { hardenStoredHtml } from 'cms-control/core/validation/hardenStoredHtml';

const MAX_CONTENT = 5_000_000;

export const DEFAULT_TEMPLATE_CONTENT = '<p></p>';

export function sanitizeTemplateContent(value: unknown): string {
    if (value == null) return DEFAULT_TEMPLATE_CONTENT;
    if (typeof value !== 'string') throw new InvalidParam('content', 'Must be a string.');
    if (value.length > MAX_CONTENT) throw new InvalidParam('content', `Max ${MAX_CONTENT} chars.`);
    if (value.trim().length === 0) return DEFAULT_TEMPLATE_CONTENT;
    return hardenStoredHtml(value);
}
