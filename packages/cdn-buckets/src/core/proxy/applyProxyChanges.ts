import type { StorageProvider } from "../../exports/StorageProvider";
import { applyAliasChanges } from "../nginx/applyAliasChanges";

/**
 * Trigger nginx fragment regen + reload after a proxy mutation.
 *
 * Proxies are inlined into alias `server { }` blocks today, so this is
 * a thin wrapper around `applyAliasChanges`. The dedicated symbol exists
 * so call sites in `core/proxy/*.ts` don't reach into `core/nginx/*` —
 * if the proxy distribution model evolves (separate file, njs runtime
 * dispatch, sidecar), only this function changes.
 */
export async function applyProxyChanges(provider: StorageProvider): Promise<void> {
    await applyAliasChanges(provider);
}
