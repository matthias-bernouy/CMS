import type { IdentityProviderPatch, IdentityProviderRepository } from "cms-auth/providers/interfaces/IdentityProvider";
import type { UsersRepository } from "cms-auth/accounts/interfaces/UsersRepository";
import { AuthValidationError, isBuiltinProvider } from "cms-auth/application/core/validation";

export type IdentityProviderStores = {
    identityProviders: IdentityProviderRepository;
    users: UsersRepository;
};

const BUILTIN_EDIT_FIELDS: (keyof IdentityProviderPatch)[] = [
    "displayName",
    "issuer",
    "clientId",
    "clientSecretRef",
    "scopes",
];

async function isMemberReachableAfterRemoving(stores: IdentityProviderStores, providerId: string): Promise<boolean> {
    // Keep a regular login path for at least one existing member. PAT-based
    // auth is not counted because tokens can be revoked or expire.
    const all = await stores.identityProviders.list();
    const enabledAfter = new Set(all.filter((p) => p.enabled && p.id !== providerId).map((p) => p.id));
    const members = await stores.users.list();
    return members.users.some((u) => u.provider && enabledAfter.has(u.provider));
}

export async function deleteIdentityProvider(
    stores: IdentityProviderStores,
    id: string,
    expectedRevision?: number,
): Promise<boolean> {
    const provider = await stores.identityProviders.get(id);
    if (!provider) {
        return false;
    }

    if (isBuiltinProvider(provider.kind)) {
        throw new AuthValidationError("id", "builtin provider cannot be removed (disable it instead)");
    }
    if (provider.enabled && !(await isMemberReachableAfterRemoving(stores, id))) {
        throw new AuthValidationError("id", "cannot remove: no member could sign in afterwards");
    }

    return stores.identityProviders.delete(id, expectedRevision);
}

export async function updateIdentityProvider(
    stores: IdentityProviderStores,
    id: string,
    patch: IdentityProviderPatch,
    expectedRevision?: number,
) {
    const existing = await stores.identityProviders.get(id);
    if (!existing) {
        throw new AuthValidationError("id", "unknown provider");
    }

    const editsFields = BUILTIN_EDIT_FIELDS.some((key) => key in patch);
    if (isBuiltinProvider(existing.kind) && editsFields) {
        throw new AuthValidationError("id", "builtin provider fields are not editable");
    }
    if (patch.enabled === false && existing.enabled && !(await isMemberReachableAfterRemoving(stores, id))) {
        throw new AuthValidationError("enabled", "cannot disable: no member could sign in afterwards");
    }

    const updated = await stores.identityProviders.update(id, patch, expectedRevision);
    if (!updated) {
        throw new AuthValidationError("id", "unknown provider");
    }
    return updated;
}
