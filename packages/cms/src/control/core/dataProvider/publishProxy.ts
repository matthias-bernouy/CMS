import type { ControlCms } from "src/control/ControlCms";
import type { ProxyPublishInput } from "src/socle/interfaces/ProxyPublisher";

/**
 * Push the data provider's current state to the configured `ProxyPublisher`.
 * No-op when:
 *  - no publisher is wired (dev / single-tenant deployment)
 *  - the provider doesn't exist (race against concurrent delete)
 *  - the provider has no `server` yet (created but not synced — the
 *    OpenAPI spec hasn't been fetched, so we don't know where to forward)
 *
 * `provider.rules` and `provider.secrets` are passed through verbatim —
 * the validation that rejects mismatched references already ran at
 * `POST /api/data/provider`, so the publisher just ships what it gets.
 * cdn-buckets's `upsertProxy` re-validates server-side as a defense in
 * depth.
 */
export async function publishProxy(cms: ControlCms, providerId: string): Promise<void> {
    const publisher = cms.proxyPublisher;
    if (!publisher) return;

    const provider = await cms.repository.getDataProvider(providerId);
    if (!provider || !provider.server) return;

    const input: ProxyPublishInput = {
        providerId,
        server:  provider.server,
        rules:   provider.rules,
        secrets: provider.secrets,
    };
    await publisher.upsertProxy(input);
}

/**
 * Tell the publisher to drop the proxy rule. Idempotent at the
 * publisher level — safe to call even if the rule was never published.
 */
export async function unpublishProxy(cms: ControlCms, providerId: string): Promise<void> {
    const publisher = cms.proxyPublisher;
    if (!publisher) return;
    await publisher.deleteProxy(providerId);
}
