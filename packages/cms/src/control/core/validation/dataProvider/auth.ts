import InvalidParam from 'src/control/errors/Http/InvalidParam';
import type { TDataAuth, TDataHeader } from 'src/socle/interfaces/Data/data';

const MAX_BEARER_LEN = 4096;
const MAX_HEADER_NAME_LEN  = 64;
const MAX_HEADER_VALUE_LEN = 4096;

// RFC 7230 token-like subset, conservative on purpose. No spaces, no
// colons, no control characters — anything that could allow header
// injection is rejected outright.
const HEADER_NAME_RE = /^[A-Za-z0-9!#$%&'*+\-.^_`|~]+$/;

/**
 * Reads auth fields from a flat dotted body and produces a `TDataAuth`.
 * Bearer wins over headers when both are present (UI nudges users toward
 * one method, but we don't reject the combination — least-surprise).
 *
 * `prefix` selects the section of the body to read. Pass `'specAuth'`
 * for the spec-fetch credentials and `'runtimeAuth'` for the proxy-time
 * credentials — both share the same dotted-key conventions but live in
 * separate sections of the form body.
 */
export function parseAuth(body: Record<string, unknown>, prefix: string): TDataAuth {
    const bearerKey = `${prefix}.bearer`;
    const bearer    = readString(body, bearerKey).trim();
    if (bearer) {
        if (bearer.length > MAX_BEARER_LEN) {
            throw new InvalidParam(bearerKey, `Maximum ${MAX_BEARER_LEN} characters.`);
        }
        return { type: 'bearer', token: bearer };
    }

    const headers = collectHeaders(body, prefix);
    if (headers.length > 0) {
        return { type: 'headers', headers };
    }

    return { type: 'none' };
}

/** Returns true if at least one auth-related field for `prefix` is set
 *  in the body. Lets update DTOs detect "patch this auth section" without
 *  forcing the client to send every field. */
export function hasAuthFields(body: Record<string, unknown>, prefix: string): boolean {
    const headerRe  = new RegExp(`^${escape(prefix)}\\.headers\\.`);
    const bearerKey = `${prefix}.bearer`;
    for (const key of Object.keys(body)) {
        if (key === bearerKey || headerRe.test(key)) return true;
    }
    return false;
}

function collectHeaders(body: Record<string, unknown>, prefix: string): TDataHeader[] {
    const re = new RegExp(`^${escape(prefix)}\\.headers\\.(\\d+)\\.(name|value)$`);
    const indices = new Set<number>();
    for (const key of Object.keys(body)) {
        const m = re.exec(key);
        if (m && m[1] !== undefined) indices.add(Number(m[1]));
    }

    const headers: TDataHeader[] = [];
    for (const idx of [...indices].sort((a, b) => a - b)) {
        const nameKey  = `${prefix}.headers.${idx}.name`;
        const valueKey = `${prefix}.headers.${idx}.value`;
        const name  = readString(body, nameKey).trim();
        const value = readString(body, valueKey).trim();
        if (!name && !value) continue;
        if (!name)  throw new InvalidParam(nameKey,  'Required when value is set.');
        if (!value) throw new InvalidParam(valueKey, 'Required when name is set.');
        validateHeaderName(name, nameKey);
        validateHeaderValue(value, valueKey);
        headers.push({ name, value });
    }
    return headers;
}

function validateHeaderName(name: string, fieldKey: string): void {
    if (name.length > MAX_HEADER_NAME_LEN) {
        throw new InvalidParam(fieldKey, `Maximum ${MAX_HEADER_NAME_LEN} characters.`);
    }
    if (!HEADER_NAME_RE.test(name)) {
        throw new InvalidParam(fieldKey, 'Invalid characters (use letters, digits, dashes, no spaces or colons).');
    }
}

function validateHeaderValue(value: string, fieldKey: string): void {
    if (value.length > MAX_HEADER_VALUE_LEN) {
        throw new InvalidParam(fieldKey, `Maximum ${MAX_HEADER_VALUE_LEN} characters.`);
    }
    if (/[\r\n]/.test(value)) {
        throw new InvalidParam(fieldKey, 'Line breaks are not allowed.');
    }
}

function readString(body: Record<string, unknown>, key: string): string {
    const v = body[key];
    if (v === undefined || v === null) return '';
    if (typeof v !== 'string') {
        throw new InvalidParam(key, 'Must be a string.');
    }
    return v;
}

function escape(literal: string): string {
    return literal.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
