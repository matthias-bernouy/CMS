import type { FileRecord, NamespaceKeyRecord, NamespacePermission } from "cms-files/interfaces";

export function newCredential(prefix: string): { id: string; value: string } {
    const id = prefix + "_" + crypto.randomUUID();
    const secret = randomBase64Url(32);
    return { id, value: id + "." + secret };
}

export async function credentialVerifier(value: string): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
    return bytesToBase64Url(new Uint8Array(digest));
}

export async function authorizeNamespaceKey(
    value: string,
    key: NamespaceKeyRecord | null,
    permission: NamespacePermission,
    now: string,
): Promise<NamespaceKeyRecord> {
    if (
        !key ||
        key.revokedAt ||
        (key.expiresAt && key.expiresAt <= now) ||
        !key.permissions.includes(permission) ||
        !constantTimeEqual(await credentialVerifier(value), key.verifier)
    ) {
        throw new CmsFilesError("NOT_AUTHORIZED", 403);
    }
    return key;
}

export function credentialId(value: string, prefix: string): string {
    const separator = value.indexOf(".");
    const id = separator < 0 ? "" : value.slice(0, separator);
    if (!id.startsWith(prefix + "_") || value.length > 512) {
        throw new CmsFilesError("NOT_AUTHORIZED", 403);
    }
    return id;
}

export class CmsFilesError extends Error {
    constructor(
        readonly code: string,
        readonly status: number,
        readonly responseHeaders: Readonly<Record<string, string>> = {},
    ) {
        super(code);
        this.name = "CmsFilesError";
    }
}

function randomBase64Url(length: number): string {
    const bytes = crypto.getRandomValues(new Uint8Array(length));
    return bytesToBase64Url(bytes);
}

function bytesToBase64Url(bytes: Uint8Array): string {
    return Buffer.from(bytes).toString("base64url");
}

export async function createFileAccess(file: FileRecord, expiresAt: Date, signingKey: Uint8Array): Promise<string> {
    const payload = bytesToBase64Url(
        new TextEncoder().encode(
            JSON.stringify({ fileId: file.id, generation: file.generation, exp: expiresAt.getTime() }),
        ),
    );
    return payload + "." + (await sign(payload, signingKey));
}

export async function validFileAccess(
    file: FileRecord,
    access: string | undefined,
    signingKey: Uint8Array,
    now: Date,
): Promise<boolean> {
    if (!access || access.length > 2048) {
        return false;
    }
    const separator = access.lastIndexOf(".");
    if (separator < 1) {
        return false;
    }
    const payload = access.slice(0, separator);
    if (!(await validSignature(payload, access.slice(separator + 1), signingKey))) {
        return false;
    }
    try {
        const value = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as Record<string, unknown>;
        return (
            value.fileId === file.id &&
            value.generation === file.generation &&
            typeof value.exp === "number" &&
            value.exp >= now.getTime()
        );
    } catch {
        return false;
    }
}

async function sign(payload: string, signingKey: Uint8Array): Promise<string> {
    const key = await importHmacKey(signingKey, ["sign"]);
    return bytesToBase64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload))));
}

async function validSignature(payload: string, signature: string, signingKey: Uint8Array): Promise<boolean> {
    try {
        const key = await importHmacKey(signingKey, ["verify"]);
        return crypto.subtle.verify(
            "HMAC",
            key,
            new Uint8Array(Buffer.from(signature, "base64url")),
            new TextEncoder().encode(payload),
        );
    } catch {
        return false;
    }
}

function importHmacKey(signingKey: Uint8Array, usages: KeyUsage[]): Promise<CryptoKey> {
    return crypto.subtle.importKey(
        "raw",
        new Uint8Array(signingKey).buffer as ArrayBuffer,
        { name: "HMAC", hash: "SHA-256" },
        false,
        usages,
    );
}

function constantTimeEqual(left: string, right: string): boolean {
    if (left.length !== right.length) {
        return false;
    }
    let difference = 0;
    for (let index = 0; index < left.length; index += 1) {
        difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
    }
    return difference === 0;
}
