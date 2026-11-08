import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";

export class OAuthError extends Error {
    constructor(
        readonly code: string,
        readonly status = 400,
    ) {
        super(code);
    }
}

export function opaque(): string {
    return randomBytes(32).toString("base64url");
}

export function hash(value: string): string {
    return createHash("sha256").update(value).digest("base64url");
}

export function text(value: unknown, maximum = 2048): string {
    if (typeof value !== "string" || !value || value.length > maximum || /[\x00-\x1f\x7f]/u.test(value)) {
        throw new OAuthError("invalid_request");
    }
    return value;
}

export function isLocalHostname(hostname: string): boolean {
    return (
        ["localhost", "127.0.0.1", "[::1]"].includes(hostname) ||
        /^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+localhost$/u.test(hostname)
    );
}

export function redirectUri(value: unknown): string {
    const raw = text(value);
    let url: URL;
    try {
        url = new URL(raw);
    } catch {
        throw new OAuthError("invalid_redirect_uri");
    }
    const loopback = isLocalHostname(url.hostname);
    if (
        (url.protocol !== "https:" && !(url.protocol === "http:" && loopback)) ||
        url.hash ||
        url.username ||
        url.password
    ) {
        throw new OAuthError("invalid_redirect_uri");
    }
    return raw;
}

export function accessToken(claims: Record<string, unknown>, key: Uint8Array): string {
    const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
    return `${payload}.${signature(payload, key)}`;
}

export function readAccessToken(token: string, key: Uint8Array): Record<string, unknown> {
    const [payload, supplied, extra] = text(token, 4096).split(".");
    if (!payload || !supplied || extra !== undefined || !/^[A-Za-z0-9_-]+$/u.test(payload)) {
        throw new OAuthError("invalid_token", 401);
    }
    const expected = signature(payload, key);
    if (supplied.length !== expected.length || !timingSafeEqual(Buffer.from(supplied), Buffer.from(expected))) {
        throw new OAuthError("invalid_token", 401);
    }
    try {
        return JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    } catch {
        throw new OAuthError("invalid_token", 401);
    }
}

function signature(payload: string, key: Uint8Array): string {
    return createHmac("sha256", key).update(`ulvia.mcp.access.v1\0${payload}`).digest("base64url");
}
