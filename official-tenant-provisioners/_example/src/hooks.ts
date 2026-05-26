import type { ProviderHooks } from "@bernouy/tenant-provisioner-sdk";
import type { NotesStore } from "./notesStore";

/**
 * Tenant lifecycle hooks (base.md §8). The SDK owns the §8 HTTP contract +
 * registry + audit + §11 config storage (post-refactor). We only manage
 * the **domain** namespace (notes list per tenant). The hook is idempotent
 * — `createNamespace` is a no-op if it already exists.
 *
 * `providerConfig` arrives **already validated** by the SDK against the
 * zod schema. We can read it if we need to drive side-effects, but we
 * don't store it — the SDK does.
 */
export function makeHooks(store: NotesStore): ProviderHooks {
    return {
        onProvision:   async ({ tenantId }) => { store.createNamespace(tenantId); },
        onUpdate:      async () => { /* no domain side-effect on update */ },
        onDeprovision: async ({ tenantId, force }) => {
            if (force) store.dropNamespace(tenantId);
            // non-force: a real provider would schedule per its grace policy
        },
    };
}
