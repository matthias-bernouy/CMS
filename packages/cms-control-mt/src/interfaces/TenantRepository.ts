import type { Tenant } from "src/interfaces/Tenant";

export interface TenantRepository {
    /** Throws on duplicate id. */
    create(tenant: Tenant): Promise<void>;
    get(id: string): Promise<Tenant | null>;
    list(): Promise<Tenant[]>;
    update(id: string, patch: Partial<Omit<Tenant, "id" | "createdAt">>): Promise<Tenant | null>;
    /** Returns `true` when a row was deleted. */
    delete(id: string): Promise<boolean>;
}
