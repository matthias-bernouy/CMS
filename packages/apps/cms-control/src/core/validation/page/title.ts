export function isValidPageTitle(s: unknown): s is string {
    if (typeof s !== 'string') return false;
    const trimmed = s.trim();
    if (trimmed.length === 0) return false;
    if (trimmed.length > 70) return false;
    if (/[\x00-\x1F\x7F]/.test(trimmed)) return false;
    return true;
}

export function assertValidPageTitle(s: unknown): asserts s is string {
    if (typeof s !== 'string') throw new TypeError('Page title must be a string.');
    const trimmed = s.trim();
    if (trimmed.length === 0) throw new Error('Page title cannot be empty.');
    if (trimmed.length > 70) throw new Error(`Page title too long (${trimmed.length}). Max 70.`);
    if (/[\x00-\x1F\x7F]/.test(trimmed)) throw new Error('Page title contains invalid control characters.');
}