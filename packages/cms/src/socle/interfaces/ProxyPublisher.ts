/**
 * Outbound contract for shipping proxy rules to whatever upstream
 * routes `/.cms/data/<providerId>/*` (today: a `cdn-buckets` instance,
 * tomorrow possibly something else). Lives in `socle/` so the cms
 * package never imports `@bernouy/cdn-buckets` directly — the consumer
 * wires a concrete implementation.
 *
 * Idempotency contract:
 * - `upsertProxy` MUST replace any existing rule with the same
 *   `providerId`. Calling it twice with identical input is a no-op.
 * - `deleteProxy` MUST succeed even if the rule doesn't exist. No-op
 *   on already-removed rules.
 *
 * Auth values are passed in PLAINTEXT (post `${KEY}` substitution by
 * `cms.secrets`). The implementation is responsible for transporting
 * them securely (TLS to the upstream admin API) and for ensuring the
 * upstream encrypts at rest.
 */
export interface ProxyPublisher {
    upsertProxy(input: ProxyPublishInput): Promise<void>;
    deleteProxy(providerId: string): Promise<void>;
}

export type ProxyPublishInput = {
    providerId: string;
    server:     string;
    auth:       ProxyPublishAuth;
};

export type ProxyPublishAuth =
    | { type: 'none' }
    | { type: 'bearer';  token: string }
    | { type: 'headers'; headers: { name: string; value: string }[] };
