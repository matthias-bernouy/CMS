import { createPrivateKey, createPublicKey, randomBytes, sign, verify, type KeyObject } from "node:crypto";
import { canonicalJsonBytes, parseStrictJsonDocument, sha256Hex } from "@bernouy/cms-integration-packages";

const CAPABILITY_SCHEMA = "cms.integration.verifier-sandbox-capability.v1" as const;
const AUDIENCE = "cms-integration-verifier-sandbox";
const TOKEN_LIMIT = 8_192;
const MAX_LIFETIME_MS = 30_000;

type SandboxCapability = Readonly<{
    schema: typeof CAPABILITY_SCHEMA;
    audience: typeof AUDIENCE;
    bodyDigest: string;
    nonce: string;
    issuedAt: number;
    expiresAt: number;
}>;

export type SandboxCapabilitySigner = Readonly<{
    issue(body: Uint8Array, now?: number): Promise<string>;
}>;

export type SandboxCapabilityVerifier = Readonly<{
    consume(token: string, body: Uint8Array, now?: number): Promise<void>;
}>;

export function createSandboxCapabilitySigner(privateKeyPem: string, lifetimeMs = 15_000): SandboxCapabilitySigner {
    if (!Number.isSafeInteger(lifetimeMs) || lifetimeMs < 1_000 || lifetimeMs > MAX_LIFETIME_MS) {
        throw new TypeError("Sandbox capability lifetime must be between 1000 and 30000 milliseconds");
    }
    const key = privateKey(privateKeyPem);
    return Object.freeze({
        async issue(body: Uint8Array, now = Date.now()) {
            const payload = canonicalJsonBytes({
                schema: CAPABILITY_SCHEMA,
                audience: AUDIENCE,
                bodyDigest: await sha256Hex(body),
                nonce: randomBytes(24).toString("base64url"),
                issuedAt: now,
                expiresAt: now + lifetimeMs,
            } satisfies SandboxCapability);
            return `${Buffer.from(payload).toString("base64url")}.${sign(null, payload, key).toString("base64url")}`;
        },
    });
}

export function createSandboxCapabilityVerifier(publicKeyPem: string): SandboxCapabilityVerifier {
    const key = publicKey(publicKeyPem);
    const consumed = new Map<string, number>();
    return Object.freeze({
        async consume(token: string, body: Uint8Array, now = Date.now()) {
            prune(consumed, now);
            const { payloadBytes, signature } = splitToken(token);
            if (!verify(null, payloadBytes, key, signature)) {
                throw new TypeError("Sandbox capability signature is invalid");
            }
            const payload = parsePayload(payloadBytes);
            if (
                payload.issuedAt > now + 1_000 ||
                payload.expiresAt <= now ||
                payload.expiresAt - payload.issuedAt > MAX_LIFETIME_MS ||
                payload.expiresAt - payload.issuedAt < 1_000 ||
                payload.bodyDigest !== (await sha256Hex(body)) ||
                consumed.has(payload.nonce)
            ) {
                throw new TypeError("Sandbox capability is expired, replayed, or not exact");
            }
            consumed.set(payload.nonce, payload.expiresAt);
        },
    });
}

function splitToken(token: string): Readonly<{ payloadBytes: Uint8Array; signature: Uint8Array }> {
    if (!token || token.length > TOKEN_LIMIT || !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/u.test(token)) {
        throw new TypeError("Sandbox capability token is invalid");
    }
    const [payload, signature] = token.split(".");
    return {
        payloadBytes: Buffer.from(payload!, "base64url"),
        signature: Buffer.from(signature!, "base64url"),
    };
}

function parsePayload(bytes: Uint8Array): SandboxCapability {
    const value = parseStrictJsonDocument(bytes, 4_096);
    const canonical = canonicalJsonBytes(value);
    if (!sameBytes(bytes, canonical) || !value || typeof value !== "object" || Array.isArray(value)) {
        throw new TypeError("Sandbox capability payload is invalid");
    }
    const record = value as Record<string, unknown>;
    const expected = ["audience", "bodyDigest", "expiresAt", "issuedAt", "nonce", "schema"];
    if (
        Object.keys(record).toSorted().join("\0") !== expected.join("\0") ||
        record.schema !== CAPABILITY_SCHEMA ||
        record.audience !== AUDIENCE ||
        typeof record.bodyDigest !== "string" ||
        !/^[a-f0-9]{64}$/u.test(record.bodyDigest) ||
        typeof record.nonce !== "string" ||
        !/^[A-Za-z0-9_-]{32}$/u.test(record.nonce) ||
        !Number.isSafeInteger(record.issuedAt) ||
        !Number.isSafeInteger(record.expiresAt)
    ) {
        throw new TypeError("Sandbox capability payload is invalid");
    }
    return record as SandboxCapability;
}

function privateKey(pem: string): KeyObject {
    try {
        const key = createPrivateKey(pem);
        if (key.asymmetricKeyType !== "ed25519") {
            throw new TypeError();
        }
        return key;
    } catch {
        throw new TypeError("Sandbox signing key must be an Ed25519 private key");
    }
}

function publicKey(pem: string): KeyObject {
    try {
        const key = createPublicKey(pem);
        if (key.asymmetricKeyType !== "ed25519") {
            throw new TypeError();
        }
        return key;
    } catch {
        throw new TypeError("Sandbox verification key must be an Ed25519 public key");
    }
}

function prune(consumed: Map<string, number>, now: number): void {
    for (const [nonce, expiry] of consumed) {
        if (expiry <= now) {
            consumed.delete(nonce);
        }
    }
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
    return left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]);
}
