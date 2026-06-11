import type { IdentityProviderPatch, IdentityProviderRepository } from "cms-auth/interfaces/IdentityProvider";
import type { UsersRepository } from "cms-auth/interfaces/UsersRepository";
import { AuthValidationError, isBuiltinProvider } from "cms-auth/core/validation";

export type IdentityProviderStores<Role extends string> = {
    identityProviders: IdentityProviderRepository;
    users:             UsersRepository<Role>;
};

const BUILTIN_EDIT_FIELDS: (keyof IdentityProviderPatch)[] = [
    "displayName",
    "issuer",
    "clientId",
    "clientSecretRef",
    "scopes",
];

export async function isAdminReachableAfterRemoving<Role extends string>(
    stores: IdentityProviderStores<Role>,
    providerId: string,
): Promise<boolean> {
    // Keep a regular login path for at least one admin. PAT-based auth is not
    // counted because tokens can be revoked or expire; users without provider
    // provenance are also treated as unreachable by design.
    const all = await stores.identityProviders.list();
    const enabledAfter = new Set(all.filter((p) => p.enabled && p.id !== providerId).map((p) => p.id));
    const admins = await stores.users.list({ role: "admin" });
    return admins.users.some((u) => u.provider && enabledAfter.has(u.provider));
}

export async function deleteIdentityProvider<Role extends string>(
    stores: IdentityProviderStores<Role>,
    id: string,
): Promise<boolean> {
    const provider = await stores.identityProviders.get(id);
    if (!provider) return false;

    if (isBuiltinProvider(provider.kind)) {
        throw new AuthValidationError("id", "builtin provider cannot be removed (disable it instead)");
    }
    if (provider.enabled && !await isAdminReachableAfterRemoving(stores, id)) {
        throw new AuthValidationError("id", "cannot remove: no admin could sign in afterwards");
    }

    return stores.identityProviders.delete(id);
}

export async function updateIdentityProvider<Role extends string>(
    stores: IdentityProviderStores<Role>,
    id: string,
    patch: IdentityProviderPatch,
) {
    const existing = await stores.identityProviders.get(id);
    if (!existing) throw new AuthValidationError("id", "unknown provider");

    const editsFields = BUILTIN_EDIT_FIELDS.some((key) => key in patch);
    if (isBuiltinProvider(existing.kind) && editsFields) {
        throw new AuthValidationError("id", "builtin provider fields are not editable");
    }
    if (patch.enabled === false && existing.enabled && !await isAdminReachableAfterRemoving(stores, id)) {
        throw new AuthValidationError("enabled", "cannot disable: no admin could sign in afterwards");
    }

    const updated = await stores.identityProviders.update(id, patch);
    if (!updated) throw new AuthValidationError("id", "unknown provider");
    return updated;
}
