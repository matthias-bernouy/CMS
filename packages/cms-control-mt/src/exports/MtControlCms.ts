import type { Db } from "mongodb";
import type { Authentication, Runner } from "@bernouy/core";
import type { Tenant } from "src/interfaces/Tenant";
import type { TenantRepository } from "src/interfaces/TenantRepository";
import { mountTenant, type MountedTenant, type TenantRole } from "src/core/tenant/mountTenant";
import { unmountTenant } from "src/core/tenant/unmountTenant";
import { purgeTenantData } from "src/core/tenant/purgeTenantData";
import { mountSuperadminSurface } from "src/core/superadmin/mountSuperadminSurface";
import type { TenantCreateDto } from "src/core/validation/tenant/parseCreateDto";

export type SuperadminRole = "superadmin" | "user";

export type MtControlCmsDeps = {
    runner:     Runner;
    db:         Db;
    /** Public origin (https://platform.com) used by every tenant's Keycloak callback URLs. */
    appBaseUrl: string;
    tenantRepo: TenantRepository;
    /** Auth for the `/superadmin/*` surface. Distinct from per-tenant Keycloaks.
     *  Typically a `CompositeAuthentication` of the superadmin Keycloak cookie + bearer JWT
     *  (the bearer leg accepts service-account tokens from a "central hub"). */
    superadminAuth: Authentication<SuperadminRole>;
};

/**
 * Multi-tenant orchestrator. Holds the shared infrastructure (one runner,
 * one Db, one MongoClient) and lazily mounts/unmounts per-tenant CMS
 * Control instances on demand. Adding a tenant via the superadmin UI
 * triggers `addTenant`, which writes the row, mounts the routes, and
 * makes the tenant immediately reachable — no restart.
 */
export class MtControlCms {

    private readonly _runner:         Runner;
    private readonly _db:             Db;
    private readonly _appBaseUrl:     string;
    private readonly _tenantRepo:     TenantRepository;
    private readonly _superadminAuth: Authentication<SuperadminRole>;
    private readonly _mounted:        Map<string, MountedTenant> = new Map();

    constructor(deps: MtControlCmsDeps) {
        this._runner         = deps.runner;
        this._db             = deps.db;
        this._appBaseUrl     = deps.appBaseUrl;
        this._tenantRepo     = deps.tenantRepo;
        this._superadminAuth = deps.superadminAuth;
    }

    /** Read-only accessors — used by superadmin endpoints. */
    get runner():         Runner                          { return this._runner; }
    get db():             Db                              { return this._db; }
    get appBaseUrl():     string                          { return this._appBaseUrl; }
    get tenantRepo():     TenantRepository                { return this._tenantRepo; }
    get superadminAuth(): Authentication<SuperadminRole>  { return this._superadminAuth; }

    /**
     * Mount the superadmin surface AND every tenant currently in the
     * registry. Call once at boot, before `runner.start()`.
     */
    async init(): Promise<void> {
        await mountSuperadminSurface(this);
        const tenants = await this._tenantRepo.list();
        for (const t of tenants) await this._mount(t);
    }

    /** Add a tenant: persist + mount + return the live entity. */
    async addTenant(dto: TenantCreateDto): Promise<Tenant> {
        const now = new Date();
        const tenant: Tenant = { ...dto, createdAt: now, updatedAt: now };
        await this._tenantRepo.create(tenant);
        try {
            await this._mount(tenant);
        } catch (err) {
            await this._tenantRepo.delete(tenant.id).catch(() => null);
            throw err;
        }
        return tenant;
    }

    /** Remove a tenant: unmount, drop collections, delete row. */
    async removeTenant(id: string): Promise<boolean> {
        const mounted = this._mounted.get(id);
        if (mounted) {
            unmountTenant(this._runner, mounted);
            this._mounted.delete(id);
        }
        await purgeTenantData(this._db, id);
        return this._tenantRepo.delete(id);
    }

    /** Snapshot of currently mounted tenants — used by the dashboard. */
    listMounted(): MountedTenant[] {
        return [...this._mounted.values()];
    }

    private async _mount(tenant: Tenant): Promise<void> {
        const mounted = await mountTenant({
            runner:     this._runner,
            db:         this._db,
            tenant,
            appBaseUrl: this._appBaseUrl,
        });
        this._mounted.set(tenant.id, mounted);
    }
}

export type { TenantRole };
