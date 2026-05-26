import {
    createControlPlaneIssuer, type ControlPlaneIssuer,
} from "@bernouy/issuer-kit";
import type { HubConfig } from "src/interfaces/HubConfig";
import type { TenantProvisionerImport } from "src/interfaces/TenantProvisionerImport";
import type { TenantProvisionerImportsRepository } from "src/interfaces/TenantProvisionerImportsRepository";
import type { Namespace, Tenant } from "src/interfaces/Namespace";
import type { NamespaceRepository } from "src/interfaces/NamespaceRepository";
import { MemoryTenantProvisionerImportsRepository } from "src/default-implementation/MemoryTenantProvisionerImportsRepository";
import { MemoryNamespaceRepository }           from "src/default-implementation/MemoryNamespaceRepository";
import { importTenantProvisioner }   from "src/core/tenantProvisioner/importTenantProvisioner";
import { refreshTenantProvisioner }  from "src/core/tenantProvisioner/refreshTenantProvisioner";
import { unimportTenantProvisioner } from "src/core/tenantProvisioner/unimportTenantProvisioner";
import { createNamespace }      from "src/core/namespace/createNamespace";
import { deleteNamespace }      from "src/core/namespace/deleteNamespace";
import { createTenant }         from "src/core/namespace/createTenant";
import { updateTenant }         from "src/core/namespace/updateTenant";
import { removeTenant }         from "src/core/namespace/removeTenant";
import { fetchTenantConfig }    from "src/core/namespace/fetchTenantConfig";
import { fetchProviderLogs, fetchTenantLogs, fetchNamespaceLogs, type LogQuery, type LogPage } from "src/core/logs/fetchLogs";
import { fetchTenantInfo, type TenantInfo } from "src/core/tenantInfo";
import type {
    CreateNamespaceInput, UpdateNamespaceInput,
    CreateTenantInput, UpdateTenantInput,
} from "src/core/schemas/namespace";

/**
 * Composition root post-pivot. The hub is now :
 *  - A `ControlPlaneIssuer` (mints CP tokens for TP-side `/admin/*` calls).
 *  - A `TenantProvisionerImportsRepository` (the TP registry).
 *  - A `NamespaceRepository` (the meta-org table : namespaces + their
 *    per-TP provisions, each with its trusted-issuer list).
 *
 * The hub NO LONGER manages identity (no Keycloak realm / OIDC client /
 * user creation). The trusted issuers are supplied by the operator (or by
 * a consumer via API) when activating a TP for a namespace. The
 * `/admin/*` superadmin UI is still authenticated against a Keycloak
 * instance via `auth-keycloak` — that Keycloak is configured at deploy
 * time, the hub itself never calls its admin API.
 */
export class Hub {

    private readonly _config:    HubConfig;
    public  readonly issuer:     ControlPlaneIssuer;
    public  readonly imports:    TenantProvisionerImportsRepository;
    public  readonly namespaces: NamespaceRepository;

    constructor(config: HubConfig) {
        this._config    = config;
        this.issuer     = createControlPlaneIssuer({
            issuer:   config.issuer.baseUrl,
            keyStore: config.issuer.keyStore,
        });
        this.imports    = config.imports    ?? new MemoryTenantProvisionerImportsRepository();
        this.namespaces = config.namespaces ?? new MemoryNamespaceRepository();
    }

    /** Read-only access to the HubConfig (used by mountHubApi to wire the
     *  issuer-kit `/.well-known` + `/jwks.json` endpoints). */
    get config(): HubConfig { return this._config; }

    // ── tenant-provisioner registry orchestration ──

    importTenantProvisioner(input: { url: string; name?: string }): Promise<TenantProvisionerImport> {
        return importTenantProvisioner(this, input);
    }
    listTenantProvisioners(): Promise<TenantProvisionerImport[]> {
        return this.imports.list();
    }
    getTenantProvisioner(providerId: string): Promise<TenantProvisionerImport | null> {
        return this.imports.getByProviderId(providerId);
    }
    refreshTenantProvisioner(providerId: string): Promise<TenantProvisionerImport> {
        return refreshTenantProvisioner(this, providerId);
    }
    unimportTenantProvisioner(providerId: string): Promise<void> {
        return unimportTenantProvisioner(this, providerId);
    }

    // ── namespace registry ──

    createNamespace(input: CreateNamespaceInput): Promise<Namespace> {
        return createNamespace(this.namespaces, input);
    }
    listNamespaces(): Promise<Namespace[]> {
        return this.namespaces.listNamespaces();
    }
    getNamespace(namespaceId: string): Promise<Namespace | null> {
        return this.namespaces.getNamespace(namespaceId);
    }
    updateNamespace(namespaceId: string, patch: UpdateNamespaceInput): Promise<Namespace | null> {
        return this.namespaces.updateNamespace(namespaceId, patch);
    }
    deleteNamespace(namespaceId: string): Promise<void> {
        return deleteNamespace(this, namespaceId);
    }

    // ── tenants (a namespace may hold many, even of the same TP) ──

    listTenants(namespaceId: string): Promise<Tenant[]> {
        return this.namespaces.listTenants(namespaceId);
    }
    listTenantsByProvider(providerId: string): Promise<Tenant[]> {
        return this.namespaces.listTenantsByProvider(providerId);
    }
    getTenant(tenantId: string): Promise<Tenant | null> {
        return this.namespaces.getTenant(tenantId);
    }
    createTenant(namespaceId: string, providerId: string, input: CreateTenantInput): Promise<Tenant> {
        return createTenant(this, namespaceId, providerId, input);
    }
    updateTenant(tenantId: string, input: UpdateTenantInput): Promise<Tenant> {
        return updateTenant(this, tenantId, input);
    }
    removeTenant(tenantId: string, opts?: { force?: boolean }): Promise<void> {
        return removeTenant(this, tenantId, opts ?? {});
    }
    fetchTenantConfig(tenantId: string): Promise<unknown | null> {
        return fetchTenantConfig(this, tenantId);
    }

    // ── logs (proxied from each TP's control-plane /admin/logs) ──

    fetchProviderLogs(providerId: string, query: LogQuery): Promise<LogPage> {
        return fetchProviderLogs(this, providerId, query);
    }
    fetchTenantLogs(tenantId: string, query: Omit<LogQuery, "tenantId">): Promise<LogPage> {
        return fetchTenantLogs(this, tenantId, query);
    }
    fetchNamespaceLogs(namespaceId: string, query: Omit<LogQuery, "tenantId" | "cursor">): Promise<LogPage> {
        return fetchNamespaceLogs(this, namespaceId, query);
    }

    // ── tenant info (TP-computed read-only facts, /admin/info) ──

    fetchTenantInfo(tenantId: string): Promise<TenantInfo> {
        return fetchTenantInfo(this, tenantId);
    }
}
