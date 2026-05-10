import type { RulesConfig } from "@bernouy/cdn-buckets";

/**
 * Outbound contract for shipping proxy rules to whatever upstream
 * routes `/.cms/data/<providerId>/*` (today: a `cdn-buckets` instance,
 * tomorrow possibly something else). Lives in `socle/` so the cms
 * package never imports `@bernouy/cdn-buckets` directly at runtime —
 * the consumer wires a concrete implementation; only the type is
 * borrowed.
 *
 * Idempotency contract:
 * - `upsertProxy` MUST replace any existing rule with the same
 *   `providerId`. Calling it twice with identical input is a no-op.
 * - `deleteProxy` MUST succeed even if the rule doesn't exist. No-op
 *   on already-removed rules.
 *
 * `secrets` carries cleartext values referenced by `${env:NAME}`
 * interpolations inside `rules`. The implementation transports them
 * securely (TLS to the upstream admin API) and the upstream encrypts
 * at rest before they reach disk.
 */
export interface ProxyPublisher {
    upsertProxy(input: ProxyPublishInput): Promise<void>;
    deleteProxy(providerId: string): Promise<void>;
}

export type ProxyPublishInput = {
    providerId: string;
    server:     string;
    rules:      RulesConfig;
    /** envName → cleartext. Every `${env:NAME}` referenced in `rules`
     *  must have a matching entry; the publisher rejects otherwise. */
    secrets:    Record<string, string>;
};
