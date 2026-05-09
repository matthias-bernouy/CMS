// HTTP token characters per RFC 7230, restricted to what's reasonable in
// a nginx `proxy_set_header <name>` directive. Letters, digits, dash. We
// don't allow the full RFC token grammar (which includes `!#$%&'*+...`)
// because most of those characters would either break the nginx directive
// or surprise the upstream.
const HEADER_NAME_PATTERN = /^[A-Za-z][A-Za-z0-9-]{0,63}$/;

export function assertValidProxyHeaderName(value: unknown, fieldName: string): asserts value is string {
    if (typeof value !== "string") {
        throw new TypeError(`${fieldName} must be a string.`);
    }
    if (!HEADER_NAME_PATTERN.test(value)) {
        throw new Error(`${fieldName} must be 1–64 chars, letters / digits / dashes, starting with a letter.`);
    }
}
