import { randomBytes } from "node:crypto";
import type { Db } from "mongodb";
import type { Runner, SecretCrypto } from "@bernouy/core";
import type { Tenant, TenantKeycloak } from "src/interfaces/Tenant";
import type { TenantRepository } from "src/interfaces/TenantRepository";
import { mountTenant, type MountedTenant, type TenantRole } from "src/core/tenant/mountTenant";
import { unmountTenant } from "src/core/tenant/unmountTenant";
import { purgeTenantData } from "src/core/tenant/purgeTenantData";
import { seedAdmin } from "src/core/tenant/members";

/**
 * What a provisioner passes to mount a tenant. `sessionSecret` is omitted —
 * that cookie-signing secret is platform-internal, owned by the runtime
 * (generated on first provision, persisted, reused on remount). Authorization
 * is by email: `initialAdminEmail` is seeded as the tenant's first CMS admin.
 */
export type TenantProvisionInput = {
    id:                string;
    name:              string;
    keycloak:          Omit<TenantKeycloak, "sessionSecret">;
    /** Email of the bootstrap admin — seeded into the tenant's member set. */
    initialAdminEmail: string;
};

const newSessionSecret = (): string => randomBytes(32).toString("base64url");

export type MtControlCmsDeps = {
    runner:     Runner;
    db:         Db;
    /** Public origin (https://platform.com) used by every tenant's Keycloak callback URLs. */
    appBaseUrl: string;
    tenantRepo: TenantRepository;
    /** Envelope-encryption surface used by every per-tenant `SecretStore`.
     *  Typically `new EnvelopeSecretCrypto(kekProvider, dekRepo)` where
     *  `kekProvider` is `OvhOkmsKekProvider` (Customer Managed Key in OVH
     *  OKMS, never reachable in-process) and `dekRepo` is a single
     *  `MongoDekRepository` on a shared `cms_deks` collection — DEKs
     *  isolate across tenants by `scopeId = tenantId`. */
    secretCrypto: SecretCrypto;
};

/**
 * Multi-tenant orchestrator. Holds the shared infrastructure (one runner,
 * one Db, one MongoClient) and lazily mounts/unmounts per-tenant CMS
 * Control instances on demand. Provisioning is driven by the hub via the
 * `cms-control` tenant-provisioner's hooks, which call
 * `provisionTenant`/`reprovisionTenant`/`deprovisionTenant` — there is no
 * in-process superadmin surface; the tenant registry is a hub-fed runtime
 * store.
 */
export class MtControlCms {

    private readonly _runner:         Runner;
    private readonly _db:             Db;
    private readonly _appBaseUrl:     string;
    private readonly _tenantRepo:     TenantRepository;
    private readonly _secretCrypto:   SecretCrypto;
    private readonly _mounted:        Map<string, MountedTenant> = new Map();

    constructor(deps: MtControlCmsDeps) {
        this._runner         = deps.runner;
        this._db             = deps.db;
        this._appBaseUrl     = deps.appBaseUrl;
        this._tenantRepo     = deps.tenantRepo;
        this._secretCrypto   = deps.secretCrypto;
    }

    /** Read-only accessors — used by the provisioning connector. */
    get runner():     Runner            { return this._runner; }
    get db():         Db                { return this._db; }
    get appBaseUrl(): string            { return this._appBaseUrl; }
    get tenantRepo(): TenantRepository  { return this._tenantRepo; }

    /**
     * Mount every tenant currently in the registry. Call once at boot,
     * before `runner.start()`. The hub does NOT re-run `onProvision` after a
     * restart, so this boot-mount is what brings existing tenants back online.
     */
    async init(): Promise<void> {
        const tenants = await this._tenantRepo.list();
        for (const t of tenants) await this._mount(t);
    }

    /**
     * Provision a tenant: persist the row (minting a fresh `sessionSecret`)
     * and mount it. **Idempotent** — a tenant already mounted is left as-is
     * (the hub may retry `onProvision`); the OIDC carried by a retry is
     * ignored (config changes go through `reprovisionTenant`).
     */
    async provisionTenant(input: TenantProvisionInput): Promise<void> {
        if (this._mounted.has(input.id)) return;

        const now = new Date();
        const tenant: Tenant = {
            id: input.id, name: input.name, createdAt: now, updatedAt: now,
            keycloak: { ...input.keycloak, sessionSecret: newSessionSecret() },
        };
        await this._tenantRepo.create(tenant);
        try {
            await seedAdmin(this._db, input.id, input.initialAdminEmail);
            await this._mount(tenant);
        } catch (err) {
            // mountTenant registers routes (KeycloakConsumer, broker, …) before
            // its first async network call. If it throws afterwards, those
            // routes remain on the runner and a retry with corrected config
            // stacks duplicates — first-match-wins keeps the broken broker
            // alive. Drop the whole prefix on rollback.
            this._runner.removeRoutesByPathPrefix(`/cms/${tenant.id}`);
            await this._tenantRepo.delete(tenant.id).catch(() => null);
            throw err;
        }
    }

    /**
     * Re-mount a tenant after an OIDC change: unmount, update the row (the
     * existing `sessionSecret` is **preserved** so admin sessions survive),
     * then mount with the new config. Falls back to a provision when the
     * tenant is unknown.
     */
    async reprovisionTenant(input: TenantProvisionInput): Promise<void> {
        const existing = await this._tenantRepo.get(input.id);
        const sessionSecret = existing?.keycloak.sessionSecret ?? newSessionSecret();

        const mounted = this._mounted.get(input.id);
        if (mounted) {
            unmountTenant(this._runner, mounted);
            this._mounted.delete(input.id);
        }

        const keycloak: TenantKeycloak = { ...input.keycloak, sessionSecret };
        let tenant = existing
            ? await this._tenantRepo.update(input.id, { name: input.name, keycloak, updatedAt: new Date() })
            : null;
        if (!tenant) {
            const now = new Date();
            tenant = { id: input.id, name: input.name, createdAt: now, updatedAt: now, keycloak };
            await this._tenantRepo.create(tenant);
        }
        await seedAdmin(this._db, input.id, input.initialAdminEmail);
        await this._mount(tenant);
    }

    /**
     * Deprovision a tenant: always unmount + drop the runtime row (so a
     * restart won't re-mount it). The tenant's **CMS data is dropped only
     * when `force`** — a non-force deprovision keeps the collections so the
     * tenant can be restored by re-provisioning the same id.
     */
    async deprovisionTenant(id: string, opts: { force: boolean }): Promise<void> {
        const mounted = this._mounted.get(id);
        if (mounted) {
            unmountTenant(this._runner, mounted);
            this._mounted.delete(id);
        }
        if (opts.force) await purgeTenantData(this._db, id);
        await this._tenantRepo.delete(id);
    }

    /** Snapshot of currently mounted tenants — used by the dashboard. */
    listMounted(): MountedTenant[] {
        return [...this._mounted.values()];
    }

    private async _mount(tenant: Tenant): Promise<void> {
        const mounted = await mountTenant({
            runner:       this._runner,
            db:           this._db,
            tenant,
            appBaseUrl:   this._appBaseUrl,
            secretCrypto: this._secretCrypto,
        });
        this._mounted.set(tenant.id, mounted);
    }
}

export type { TenantRole };
