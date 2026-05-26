import type { Db } from "mongodb";

/**
 * Per-tenant CMS-admin membership. **Authorization lives in the CMS**, not in
 * Keycloak roles: a user is admin of a tenant iff their verified email is
 * listed here. Keycloak only authenticates (shared realm, one client, zero
 * per-tenant objects).
 */
export type TenantMember = {
    /** Lowercased email — matched against the token's verified `email` claim. */
    email: string;
    role:  "admin";
};

const collection = (db: Db, tenantId: string) =>
    db.collection<TenantMember>(`tenant_${tenantId}__members`);

const norm = (email: string): string => email.trim().toLowerCase();

/** Upsert a member as admin (idempotent) — seeds the initial admin at provision. */
export async function seedAdmin(db: Db, tenantId: string, email: string): Promise<void> {
    const e = norm(email);
    if (!e) return;
    await collection(db, tenantId).updateOne(
        { email: e },
        { $set: { email: e, role: "admin" } },
        { upsert: true },
    );
}

/**
 * Load the set of admin emails (lowercased) for a tenant. Read **once per
 * mount**; `claimsToSubject` checks membership synchronously against it (the
 * email is in the token claims at login). Membership changes take effect on
 * remount — same "immutable for the mount lifetime" rule as the bucket.
 */
export async function loadAdminEmails(db: Db, tenantId: string): Promise<Set<string>> {
    const rows = await collection(db, tenantId).find({ role: "admin" }).toArray();
    return new Set(rows.map((r) => r.email));
}
