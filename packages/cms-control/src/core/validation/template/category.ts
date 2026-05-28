import InvalidParam from 'src/control/errors/Http/InvalidParam';

const MAX_CATEGORY = 50;

export function sanitizeTemplateCategory(value: unknown): string {
    if (value == null) return '';
    if (typeof value !== 'string') throw new InvalidParam('category', 'Must be a string.');
    const trimmed = value.trim();
    if (trimmed.length > MAX_CATEGORY) {
        throw new InvalidParam('category', `Max ${MAX_CATEGORY} chars.`);
    }
    return trimmed;
}
