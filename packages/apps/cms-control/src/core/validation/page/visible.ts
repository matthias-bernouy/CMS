/**
 * Coerces a "visibility" input to boolean. Accepts the actual boolean,
 * the HTML form `"on"` (when a checkbox is checked), and `"true"` for
 * JSON serializations. Anything else (including absent) → false.
 */
export function coerceVisible(value: unknown): boolean {
    return value === true || value === 'on' || value === 'true';
}
