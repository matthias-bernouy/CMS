import { createHash, createHmac, randomUUID, timingSafeEqual } from "node:crypto";

const MAX_CLOCK_SKEW_MS = 5 * 60 * 1_000;

export type RepositorySignature = Readonly<{
    authorization: string;
    timestamp: string;
    nonce: string;
    contentDigest: string;
    signature: string;
}>;

export type VerifiedRepositorySignature = Readonly<{
    replayKey: string;
    contentDigest: `sha256:${string}`;
}>;

export function signRepositoryRequest(method: string, url: URL, body: Uint8Array, token: string): RepositorySignature {
    const timestamp = String(Date.now());
    const nonce = randomUUID();
    const contentDigest = sha256(body);
    return signRepositoryContentDigest(method, url, contentDigest, token, timestamp, nonce);
}

export function signRepositoryContentDigest(
    method: string,
    url: URL,
    contentDigest: string,
    token: string,
    timestamp = String(Date.now()),
    nonce = randomUUID(),
): RepositorySignature {
    if (!/^[0-9a-f]{64}$/u.test(contentDigest)) {
        throw new TypeError("Repository content digest must be lowercase SHA-256 hex");
    }
    return {
        authorization: `Bearer ${token}`,
        timestamp,
        nonce,
        contentDigest,
        signature: `sha256=${signature(method, url, timestamp, nonce, contentDigest, token)}`,
    };
}

export function verifyRepositoryRequest(
    request: Request,
    body: Uint8Array,
    token: string,
    now = Date.now(),
): string | null {
    const verified = verifyRepositoryRequestHeaders(request, token, now);
    return verified && verified.contentDigest === `sha256:${sha256(body)}` ? verified.replayKey : null;
}

export function verifyRepositoryRequestHeaders(
    request: Request,
    token: string,
    now = Date.now(),
): VerifiedRepositorySignature | null {
    const authorization = request.headers.get("authorization");
    const timestamp = request.headers.get("x-ulvia-timestamp");
    const nonce = request.headers.get("x-ulvia-nonce");
    const contentDigest = request.headers.get("x-ulvia-content-sha256");
    const supplied = request.headers.get("x-ulvia-signature");
    if (
        !timestamp ||
        !nonce ||
        !/^[0-9a-f-]{36}$/u.test(nonce) ||
        !contentDigest ||
        !supplied ||
        !safeEqual(authorization ?? "", `Bearer ${token}`)
    ) {
        return null;
    }
    const instant = Number(timestamp);
    if (
        !Number.isSafeInteger(instant) ||
        Math.abs(now - instant) > MAX_CLOCK_SKEW_MS ||
        !/^[0-9a-f]{64}$/u.test(contentDigest)
    ) {
        return null;
    }
    const expected = `sha256=${signature(request.method, new URL(request.url), timestamp, nonce, contentDigest, token)}`;
    return safeEqual(supplied, expected) ? { replayKey: expected, contentDigest: `sha256:${contentDigest}` } : null;
}

export function matchesRepositoryToken(request: Request, token: string): boolean {
    return safeEqual(request.headers.get("authorization") ?? "", `Bearer ${token}`);
}

function signature(method: string, url: URL, timestamp: string, nonce: string, digest: string, token: string): string {
    const canonical = `${method.toUpperCase()}\n${url.pathname}\n${timestamp}\n${nonce}\n${digest}`;
    return createHmac("sha256", token).update(canonical).digest("hex");
}

function sha256(bytes: Uint8Array): string {
    return createHash("sha256").update(bytes).digest("hex");
}

function safeEqual(left: string, right: string): boolean {
    const leftBytes = Buffer.from(left);
    const rightBytes = Buffer.from(right);
    return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}
