import type { Db } from "mongodb";
import { createConcurrencyLimit } from "@bernouy/core";
import type { TenantRepository } from "@bernouy/mt-cms-control";
import { PlaywrightSession } from "@bernouy/cms";
import { buildTenant } from "src/core/tenant/buildTenant";

export type MtDeliveryCmsDeps = {
    /** Same Mongo `Db` Control writes to — Delivery uses a read-only user. */
    db:           Db;
    /** Reuse the Control tenant registry. */
    tenantRepo:   TenantRepository;
    /** Default 60 000ms (every minute). */
    intervalMs?:  number;
    /** Default 4 — bounded by `createConcurrencyLimit`. */
    concurrency?: number;
    /** Default `true` — launches one Chromium session shared across tenants. */
    enableImageEnhancement?: boolean;
    /**
     * Resize backend URL pattern shared by every tenant. `{url}`, `{width}`,
     * `{format}` placeholders. Omit to ship pages without srcset.
     */
    variantUrlPattern?: string;
};

/**
 * Multi-tenant Delivery cron. Periodically iterates the tenant registry,
 * picks the ones with `delivery.enabled === true`, and runs a build cycle
 * via `DeliveryBuilder`. Idempotent — `runOnce` no-ops when nothing
 * changed since the previous deploy (manifest fingerprint).
 */
export class MtDeliveryCms {

    private readonly _db:        Db;
    private readonly _repo:      TenantRepository;
    private readonly _interval:  number;
    private readonly _concurrency: number;
    private readonly _variantPattern?: string;

    private _session?: PlaywrightSession;
    private _timer:    ReturnType<typeof setTimeout> | null = null;
    private _stopping = false;

    constructor(deps: MtDeliveryCmsDeps) {
        this._db          = deps.db;
        this._repo        = deps.tenantRepo;
        this._interval    = deps.intervalMs  ?? 60_000;
        this._concurrency = deps.concurrency ?? 4;
        if (deps.variantUrlPattern) this._variantPattern = deps.variantUrlPattern;
        if (deps.enableImageEnhancement !== false) this._session = new PlaywrightSession();
    }

    /** Begin the cron. Returns immediately; ticks fire on the interval. */
    start(): void {
        const tick = async () => {
            if (this._stopping) return;
            try { await this._tick(); }
            catch (err) { console.error("[delivery] tick error:", err); }
            this._timer = setTimeout(tick, this._interval);
        };
        this._timer = setTimeout(tick, 0);
    }

    async stop(): Promise<void> {
        this._stopping = true;
        if (this._timer) clearTimeout(this._timer);
        if (this._session) await this._session.close().catch(() => null);
    }

    private async _tick(): Promise<void> {
        const tenants = (await this._repo.list()).filter(t => t.delivery?.enabled === true);
        if (tenants.length === 0) return;

        const limit = createConcurrencyLimit(this._concurrency);
        await Promise.all(tenants.map(t => limit(async () => {
            try {
                await buildTenant(this._db, t, {
                    ...(this._session         ? { session: this._session }                 : {}),
                    ...(this._variantPattern  ? { variantUrlPattern: this._variantPattern } : {}),
                });
            } catch (err) {
                console.error(`[delivery] tenant=${t.id} build failed:`, err);
            }
        })));
    }
}
