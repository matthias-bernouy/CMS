import type {
    TenantRegistry, TenantState, TenantUpsert, TenantPatch,
} from "src/interfaces/TenantRegistry";
import { ProvisioningError } from "src/core/errors";

/**
 * Default `TenantRegistry` — in-memory (tests / single deployment). Holds a
 * tenant's full trusted-issuer list (multi-issuer, base.md §8). Each `iss`
 * is globally unique across tenants — a reverse `iss → tenantId` index
 * enforces this and powers the hot-path `resolveByIssuer`.
 */
export class MemoryTenantRegistry implements TenantRegistry {
    private readonly byId  = new Map<string, TenantState>();
    private readonly byIss = new Map<string, string>(); // iss -> tenantId

    async resolveByIssuer(iss: string): Promise<TenantState | null> {
        const id = this.byIss.get(iss);
        return id ? this.byId.get(id) ?? null : null;
    }

    async get(tenantId: string): Promise<TenantState | null> {
        return this.byId.get(tenantId) ?? null;
    }

    /** Re-point the reverse index from `prev` issuers to `next` issuers for
     *  `tenantId`. Throws 409 if any `next` iss already belongs to another
     *  tenant. */
    private _reindex(tenantId: string, prev: string[], next: string[]): void {
        for (const iss of next) {
            const owner = this.byIss.get(iss);
            if (owner && owner !== tenantId) {
                throw new ProvisioningError(`issuer ${iss} already bound to tenant ${owner}`, 409);
            }
        }
        for (const iss of prev) this.byIss.delete(iss);
        for (const iss of next) this.byIss.set(iss, tenantId);
    }

    /** Idempotent on `tenantId`. Replaces the issuer list. */
    async upsert(t: TenantUpsert): Promise<TenantState> {
        const existing = this.byId.get(t.tenantId);
        const issuers  = t.issuers ?? existing?.issuers ?? [];
        this._reindex(t.tenantId, existing?.issuers ?? [], issuers);
        const next: TenantState = {
            tenantId: t.tenantId, issuers, role: "tenant",
            status: existing?.status ?? "active",
            ...(t.displayName !== undefined ? { displayName: t.displayName } : existing?.displayName !== undefined ? { displayName: existing.displayName } : {}),
            ...(t.plan        !== undefined ? { plan: t.plan }               : existing?.plan        !== undefined ? { plan: existing.plan } : {}),
        };
        this.byId.set(next.tenantId, next);
        return next;
    }

    async patch(tenantId: string, p: TenantPatch): Promise<TenantState> {
        const cur = this.byId.get(tenantId);
        if (!cur) throw new ProvisioningError(`unknown tenant ${tenantId}`, 404);
        if (p.issuers !== undefined) this._reindex(tenantId, cur.issuers, p.issuers);
        const next: TenantState = {
            ...cur,
            ...(p.issuers     !== undefined ? { issuers: p.issuers }         : {}),
            ...(p.status      !== undefined ? { status: p.status }           : {}),
            ...(p.displayName !== undefined ? { displayName: p.displayName } : {}),
            ...(p.plan        !== undefined ? { plan: p.plan }               : {}),
        };
        this.byId.set(tenantId, next);
        return next;
    }

    async remove(tenantId: string, _opts: { force: boolean }): Promise<void> {
        const cur = this.byId.get(tenantId);
        if (!cur) return;
        this.byId.delete(tenantId);
        for (const iss of cur.issuers) this.byIss.delete(iss);
    }

    async list(): Promise<TenantState[]> {
        return [...this.byId.values()].sort((a, b) => a.tenantId.localeCompare(b.tenantId));
    }
}
