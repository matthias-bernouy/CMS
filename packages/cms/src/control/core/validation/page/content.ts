import InvalidParam from 'src/control/errors/Http/InvalidParam';

const MAX_CONTENT = 5_000_000;

export function sanitizePageContent(value: unknown): string {
    if (value == null) return '';
    if (typeof value !== 'string') throw new InvalidParam('content', 'Must be a string.');
    if (value.length > MAX_CONTENT) throw new InvalidParam('content', `Max ${MAX_CONTENT} chars.`);
    return value;
}
