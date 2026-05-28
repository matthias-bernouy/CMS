import InvalidParam from 'src/control/errors/Http/InvalidParam';

const MAX_DESCRIPTION = 200;

export function sanitizeTemplateDescription(value: unknown): string {
    if (value == null) return '';
    if (typeof value !== 'string') throw new InvalidParam('description', 'Must be a string.');
    const trimmed = value.trim();
    if (trimmed.length > MAX_DESCRIPTION) {
        throw new InvalidParam('description', `Max ${MAX_DESCRIPTION} chars.`);
    }
    return trimmed;
}
