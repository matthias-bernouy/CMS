import { CmsSecretNotAuthorized, CmsSecretNotFound } from "cms-secrets/core/errors";
import type { SecretNamespaceKeyRecord, SecretNamespacePermission } from "cms-secrets/interfaces/CmsSecret";

export function newCredential(prefix: string): { id: string; value: string } {
    const id = `${prefix}_${crypto.randomUUID()}`;
    return { id, value: `${id}.${Buffer.from(crypto.getRandomValues(new Uint8Array(32))).toString("base64url")}` };
}

export async function credentialVerifier(value: string): Promise<string> {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
    return Buffer.from(new Uint8Array(digest)).toString("base64url");
}

export function credentialId(value: string, prefix: string): string {
    const separator = value.indexOf(".");
    const id = separator < 0 ? "" : value.slice(0, separator);
    if (!id.startsWith(`${prefix}_`) || value.length > 512) {
        throw new CmsSecretNotAuthorized();
    }
    return id;
}

export async function authorizeNamespaceKey(
    namespaceId: string,
    value: string,
    key: SecretNamespaceKeyRecord | null,
    permission: SecretNamespacePermission | readonly SecretNamespacePermission[],
    now: Date,
): Promise<SecretNamespaceKeyRecord> {
    const permissions = typeof permission === "string" ? [permission] : permission;
    if (
        !key ||
        key.id !== credentialId(value, "snk") ||
        key.revokedAt ||
        (key.expiresAt && key.expiresAt <= now) ||
        permissions.length === 0 ||
        permissions.some((permission) => !key.permissions.includes(permission)) ||
        !constantTimeEqual(await credentialVerifier(value), key.verifier)
    ) {
        throw new CmsSecretNotAuthorized();
    }
    if (key.namespaceId !== namespaceId) {
        throw new CmsSecretNotFound("secret namespace does not exist");
    }
    return key;
}

function constantTimeEqual(left: string, right: string): boolean {
    const leftBytes = new TextEncoder().encode(left);
    const rightBytes = new TextEncoder().encode(right);
    let difference = leftBytes.length ^ rightBytes.length;
    const length = Math.max(leftBytes.length, rightBytes.length);
    for (let index = 0; index < length; index += 1) {
        difference |= (leftBytes[index] ?? 0) ^ (rightBytes[index] ?? 0);
    }
    return difference === 0;
}
