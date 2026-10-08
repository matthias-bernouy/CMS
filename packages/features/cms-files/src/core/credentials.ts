import type { NamespaceKeyRecord, NamespacePermission } from "cms-files/interfaces";

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

export function randomBase64Url(length: number): string {
    const bytes = crypto.getRandomValues(new Uint8Array(length));
    return bytesToBase64Url(bytes);
}

export function bytesToBase64Url(bytes: Uint8Array): string {
    return Buffer.from(bytes).toString("base64url");
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
