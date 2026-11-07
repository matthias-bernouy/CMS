export const ACTOR_CREDENTIAL_HEADER = "x-ulvia-actor-credential";
export const SESSION_EFFECT_HEADER = "x-ulvia-session-effect";

export type GatewayActorCredential =
    | { readonly kind: "bearer"; readonly token: string }
    | { readonly kind: "session"; readonly token: string };

export type GatewaySessionEffect =
    | { readonly type: "session"; readonly operation: "clear" }
    | {
          readonly type: "session";
          readonly operation: "establish";
          readonly token: string;
          readonly expiresAt: string;
      };

export type GatewayResponseEffect = GatewaySessionEffect;

const MAX_TOKEN_LENGTH = 4_096;
const MAX_HEADER_LENGTH = 8_192;

export function actorCredentialFromRequest(request: Request): GatewayActorCredential | undefined {
    const authorization = request.headers.get("authorization");
    if (authorization?.startsWith("Bearer ")) {
        return actorCredential({ kind: "bearer", token: authorization.slice(7) });
    }
    const cookie = request.headers.get("cookie");
    for (const part of cookie?.split(";") ?? []) {
        const separator = part.indexOf("=");
        if (separator >= 0 && part.slice(0, separator).trim() === "cms-session") {
            return actorCredential({ kind: "session", token: part.slice(separator + 1).trim() });
        }
    }
    return undefined;
}

export function encodeActorCredential(value: GatewayActorCredential): string {
    return encodeTrustedHeader(actorCredential(value));
}

export function decodeActorCredential(value: string | null): GatewayActorCredential | undefined {
    if (value === null) {
        return undefined;
    }
    const parsed = decodeTrustedHeader(value);
    return actorCredential(parsed);
}

export function encodeSessionEffect(value: GatewaySessionEffect): string {
    return encodeTrustedHeader(sessionEffect(value));
}

export function decodeSessionEffect(value: string | null): GatewaySessionEffect | undefined {
    if (value === null) {
        return undefined;
    }
    return sessionEffect(decodeTrustedHeader(value));
}

function actorCredential(value: unknown): GatewayActorCredential {
    const record = exactRecord(value, ["kind", "token"]);
    if (record.kind !== "bearer" && record.kind !== "session") {
        throw new TypeError("Actor credential kind is invalid");
    }
    return { kind: record.kind, token: opaqueToken(record.token) };
}

function sessionEffect(value: unknown): GatewaySessionEffect {
    const operation = value && typeof value === "object" ? (value as { operation?: unknown }).operation : undefined;
    const record = exactRecord(
        value,
        operation === "clear" ? ["type", "operation"] : ["type", "operation", "token", "expiresAt"],
    );
    if (record.type !== "session") {
        throw new TypeError("Response effect type is invalid");
    }
    if (record.operation === "clear") {
        return { type: "session", operation: "clear" };
    }
    if (record.operation !== "establish") {
        throw new TypeError("Session effect operation is invalid");
    }
    const expiresAt = text(record.expiresAt, 64);
    if (!Number.isFinite(Date.parse(expiresAt))) {
        throw new TypeError("Session effect expiry is invalid");
    }
    return { type: "session", operation: "establish", token: opaqueToken(record.token), expiresAt };
}

function opaqueToken(value: unknown): string {
    const token = text(value, MAX_TOKEN_LENGTH);
    if (!token || /[\x00-\x20\x7f]/u.test(token)) {
        throw new TypeError("Opaque credential is invalid");
    }
    return token;
}

function encodeTrustedHeader(value: unknown): string {
    const bytes = new TextEncoder().encode(JSON.stringify(value));
    let binary = "";
    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }
    const encoded = btoa(binary).replace(/\+/gu, "-").replace(/\//gu, "_").replace(/=+$/u, "");
    if (encoded.length > MAX_HEADER_LENGTH) {
        throw new TypeError("Trusted capability metadata exceeds its transport limit");
    }
    return encoded;
}

function decodeTrustedHeader(value: string): unknown {
    if (!value || value.length > MAX_HEADER_LENGTH || !/^[A-Za-z0-9_-]+$/u.test(value)) {
        throw new TypeError("Trusted capability metadata is invalid");
    }
    const standard = value.replace(/-/gu, "+").replace(/_/gu, "/");
    const binary = atob(standard + "=".repeat((4 - (standard.length % 4)) % 4));
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0))));
}

function exactRecord(value: unknown, fields: readonly string[]): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new TypeError("Trusted capability metadata must be an object");
    }
    const record = value as Record<string, unknown>;
    if (Object.keys(record).length !== fields.length || fields.some((field) => !Object.hasOwn(record, field))) {
        throw new TypeError("Trusted capability metadata shape is invalid");
    }
    return record;
}

function text(value: unknown, maximum: number): string {
    if (typeof value !== "string" || value.length > maximum) {
        throw new TypeError("Trusted capability metadata field is invalid");
    }
    return value;
}
