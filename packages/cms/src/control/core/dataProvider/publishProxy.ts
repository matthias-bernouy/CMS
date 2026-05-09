import type { ControlCms } from 'src/control/ControlCms';
import { resolveAuth } from './resolveAuth';
import { SecretNotFound } from 'src/control/errors/SecretNotFound';

/**
 * Push the data provider's current state to the configured `ProxyPublisher`.
 * No-op when:
 *  - no publisher is wired (dev / single-tenant deployment)
 *  - the provider doesn't exist (race against concurrent delete)
 *  - the provider has no `server` yet (created but not synced — the
 *    OpenAPI spec hasn't been fetched, so we don't know where to forward)
 *
 * Secrets are resolved here via `resolveAuth` so the publisher receives
 * plaintext. A `SecretNotFound` is logged and swallowed: the provider
 * row is fine, the proxy just won't activate until the operator fixes
 * the missing secret and re-saves the provider. Other errors propagate
 * to the caller (admin gets a useful failure message).
 */
export async function publishProxy(cms: ControlCms, providerId: string): Promise<void> {
    const publisher = cms.proxyPublisher;
    if (!publisher) return;

    const provider = await cms.repository.getDataProvider(providerId);
    if (!provider) return;
    if (!provider.server) return;

    let resolvedAuth;
    try {
        resolvedAuth = await resolveAuth(provider.runtimeAuth, cms.secrets);
    } catch (e) {
        if (e instanceof SecretNotFound) {
            console.warn(`[publishProxy] skipping "${providerId}" — missing secret ${e.key}`);
            return;
        }
        throw e;
    }

    await publisher.upsertProxy({
        providerId,
        server: provider.server,
        auth:   resolvedAuth,
    });
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
