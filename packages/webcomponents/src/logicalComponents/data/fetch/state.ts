export function isEmpty(data: unknown): boolean {
    if (data === null || data === undefined) return true;
    if (Array.isArray(data)) return data.length === 0;
    if (typeof data === 'object') return Object.keys(data as object).length === 0;
    return false;
}
