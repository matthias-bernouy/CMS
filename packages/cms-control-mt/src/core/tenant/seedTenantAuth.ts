import type { Db } from "mongodb";
import { MongoUsersRepository, MongoIdentityProviderRepository, MongoLocalCredentialStore, internalUserId, type PiiCrypto } from "@bernouy/auth-core";
import type { TenantRole } from "src/core/tenant/mountTenant";

/**
 * Seed a tenant's local auth bootstrap, idempotently:
 *  - the builtin `local` identity provider (singleton, email/password),
 *  - an admin credential in the local credential store,
 *  - the admin's `admin` role in the membership store.
 *
 * Safe to call on every provision — existing entries are left untouched, so a
 * retried provision never resets the admin password or duplicates the provider.
 * PII (the admin email) is encrypted via the same `PiiCrypto` as the rest.
 */
export async function seedTenantAuth(
    db: Db,
    tenantId: string,
    pii: PiiCrypto,
    admin: { email: string; password: string },
): Promise<void> {
    const collectionPrefix = `tenant_${tenantId}__`;
    const idps  = new MongoIdentityProviderRepository(db, { collectionPrefix });
    const creds = new MongoLocalCredentialStore(db, pii, { collectionPrefix });
    const users = new MongoUsersRepository<TenantRole>(db, pii, { collectionPrefix });
    await creds.init();

    if (!(await idps.get("local"))) {
        await idps.create({
            id: "local", kind: "local", enabled: true,
            displayName: "Email & password",
        });
    }

    if (!(await creds.getByEmail(admin.email))) {
        const identity = await creds.create({ email: admin.email, password: admin.password, displayName: "Administrator" });
        await users.upsert({ ...identity, sub: internalUserId("local", identity.sub), provider: "local" }, "admin");
    }
}
