import type { Recorder } from "src/interfaces/Recorder";

const REASON_TO_EVENT: Record<string, string> = {
    bearer_missing:                "auth.bearer_missing",
    ssrf_or_issuer_mismatch:       "auth.ssrf",
    contract_version_incompatible: "auth.contract_version",
    discovery_unreachable:         "auth.discovery_unreachable",
    alg_not_allowed:               "auth.alg_rejected",
    iss_not_trusted:               "auth.iss_untrusted",
    verify_failed:                 "auth.verify_failed",
    claims_shape:                  "auth.claims_shape",
    replay:                        "auth.replay",
    iat_future:                    "auth.iat_future",
};

/**
 * Adapts the verifier's `onSecurity(reason, ctx)` to the unified Recorder
 * (`kind: security`). Keeps the old signature so `verifyToken`/`discovery`
 * and their tests are untouched — the wiring happens in the mount (07).
 * Best-effort: a catalog miss / store error never breaks the hot path.
 */
export function makeSecurityLogger(
    recorder: Recorder,
): (reason: string, ctx: Record<string, unknown>) => void {
    return (reason, ctx) => {
        const event = REASON_TO_EVENT[reason] ?? "auth.unknown";
        const iss = typeof ctx["iss"] === "string" ? (ctx["iss"] as string) : undefined;
        try {
            void recorder.record({
                kind: "security", level: "warn", event,
                tenantId: null, actor: "anonymous", visibility: "control-plane",
                outcome: "deny",
                ...(iss ? { iss } : {}),
                ctx,
            });
        } catch { /* best-effort: never throw on the hot path */ }
    };
}
