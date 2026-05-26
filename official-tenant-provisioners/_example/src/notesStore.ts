/**
 * Pure domain data: notes per tenant. Per base.md §11 (post-refactor), the
 * tenant config is stored by the SDK via a `TenantConfigStore` — no more
 * config coupling here, the domain stays single-purpose.
 */
export class NotesStore {
    private readonly byTenant = new Map<string, string[]>();

    createNamespace(tenantId: string): void {
        if (!this.byTenant.has(tenantId)) this.byTenant.set(tenantId, []);
    }
    dropNamespace(tenantId: string): void {
        this.byTenant.delete(tenantId);
    }
    add(tenantId: string, note: string): void {
        this.byTenant.get(tenantId)?.push(note);
    }
    list(tenantId: string): string[] {
        return [...(this.byTenant.get(tenantId) ?? [])];
    }
}
