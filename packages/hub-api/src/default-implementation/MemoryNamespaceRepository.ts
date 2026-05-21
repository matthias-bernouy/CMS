import type { Namespace, Tenant } from "src/interfaces/Namespace";
import type { NamespaceRepository } from "src/interfaces/NamespaceRepository";
import { HubError } from "src/core/HubError";

/** In-memory `NamespaceRepository` for dev / tests. */
export class MemoryNamespaceRepository implements NamespaceRepository {

    private readonly _namespaces = new Map<string, Namespace>();
    private readonly _tenants    = new Map<string, Tenant>(); // keyed by tenantId

    async listNamespaces(): Promise<Namespace[]> {
        return [...this._namespaces.values()].sort((a, b) => a.namespaceId.localeCompare(b.namespaceId));
    }
    async getNamespace(namespaceId: string): Promise<Namespace | null> {
        return this._namespaces.get(namespaceId) ?? null;
    }
    async insertNamespace(ns: Namespace): Promise<Namespace> {
        if (this._namespaces.has(ns.namespaceId)) {
            throw new HubError("duplicate_namespace_id", `namespace "${ns.namespaceId}" already exists`);
        }
        this._namespaces.set(ns.namespaceId, ns);
        return ns;
    }
    async updateNamespace(namespaceId: string, patch: Partial<Pick<Namespace, "displayName" | "description">>): Promise<Namespace | null> {
        const ns = this._namespaces.get(namespaceId);
        if (!ns) return null;
        const next = { ...ns, ...patch };
        this._namespaces.set(namespaceId, next);
        return next;
    }
    async removeNamespace(namespaceId: string): Promise<boolean> {
        const had = this._namespaces.delete(namespaceId);
        for (const [id, t] of [...this._tenants]) {
            if (t.namespaceId === namespaceId) this._tenants.delete(id);
        }
        return had;
    }

    async listTenants(namespaceId: string): Promise<Tenant[]> {
        return [...this._tenants.values()]
            .filter((t) => t.namespaceId === namespaceId)
            .sort((a, b) => a.tenantId.localeCompare(b.tenantId));
    }
    async listTenantsByProvider(providerId: string): Promise<Tenant[]> {
        return [...this._tenants.values()]
            .filter((t) => t.providerId === providerId)
            .sort((a, b) => a.tenantId.localeCompare(b.tenantId));
    }
    async getTenant(tenantId: string): Promise<Tenant | null> {
        return this._tenants.get(tenantId) ?? null;
    }
    async insertTenant(t: Tenant): Promise<Tenant> {
        if (this._tenants.has(t.tenantId)) {
            throw new HubError("duplicate_provision", `tenant "${t.tenantId}" already exists`);
        }
        this._tenants.set(t.tenantId, t);
        return t;
    }
    async updateTenant(
        tenantId: string,
        patch: Partial<Pick<Tenant, "issuers" | "config" | "status" | "displayName">>,
    ): Promise<Tenant | null> {
        const cur = this._tenants.get(tenantId);
        if (!cur) return null;
        const next = { ...cur, ...patch };
        this._tenants.set(tenantId, next);
        return next;
    }
    async removeTenant(tenantId: string): Promise<boolean> {
        return this._tenants.delete(tenantId);
    }
}
