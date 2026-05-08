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
 */
export function parseAuth(body: Record<string, unknown>): TDataAuth {
    const bearer = readString(body, 'auth.bearer').trim();
    if (bearer) {
        if (bearer.length > MAX_BEARER_LEN) {
            throw new InvalidParam('auth.bearer', `Maximum ${MAX_BEARER_LEN} characters.`);
        }
        return { type: 'bearer', token: bearer };
    }

    const headers = collectHeaders(body);
    if (headers.length > 0) {
        return { type: 'headers', headers };
    }

    return { type: 'none' };
}

function collectHeaders(body: Record<string, unknown>): TDataHeader[] {
    const indices = new Set<number>();
    for (const key of Object.keys(body)) {
        const m = /^auth\.headers\.(\d+)\.(name|value)$/.exec(key);
        if (m && m[1] !== undefined) indices.add(Number(m[1]));
    }

    const headers: TDataHeader[] = [];
    for (const idx of [...indices].sort((a, b) => a - b)) {
        const name  = readString(body, `auth.headers.${idx}.name`).trim();
        const value = readString(body, `auth.headers.${idx}.value`).trim();
        if (!name && !value) continue;
        if (!name)  throw new InvalidParam(`auth.headers.${idx}.name`,  'Required when value is set.');
        if (!value) throw new InvalidParam(`auth.headers.${idx}.value`, 'Required when name is set.');
        validateHeaderName(name, idx);
        validateHeaderValue(value, idx);
        headers.push({ name, value });
    }
    return headers;
}

function validateHeaderName(name: string, idx: number): void {
    if (name.length > MAX_HEADER_NAME_LEN) {
        throw new InvalidParam(`auth.headers.${idx}.name`, `Maximum ${MAX_HEADER_NAME_LEN} characters.`);
    }
    if (!HEADER_NAME_RE.test(name)) {
        throw new InvalidParam(`auth.headers.${idx}.name`, 'Invalid characters (use letters, digits, dashes, no spaces or colons).');
    }
}

function validateHeaderValue(value: string, idx: number): void {
    if (value.length > MAX_HEADER_VALUE_LEN) {
        throw new InvalidParam(`auth.headers.${idx}.value`, `Maximum ${MAX_HEADER_VALUE_LEN} characters.`);
    }
    if (/[\r\n]/.test(value)) {
        throw new InvalidParam(`auth.headers.${idx}.value`, 'Line breaks are not allowed.');
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
