export function assertValidTemplateName(s: unknown): asserts s is string {
    if (typeof s !== 'string') throw new TypeError('Template name must be a string.');
    const trimmed = s.trim();
    if (trimmed.length === 0) throw new Error('Template name cannot be empty.');
    if (trimmed.length > 50) throw new Error(`Template name too long (${trimmed.length}). Max 50.`);
    if (/[\x00-\x1F\x7F]/.test(trimmed)) throw new Error('Template name contains invalid control characters.');
}
