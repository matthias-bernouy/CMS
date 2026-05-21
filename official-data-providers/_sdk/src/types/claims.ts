import type { AllowlistRole } from "src/interfaces/ProviderConfig";

// `TokenClaims` is the wire contract → single source in the shared package.
export type { TokenClaims } from "@bernouy/data-provider-contract";

/** Request scope derived from the verified token (base.md §4.5 step 8).
 *  Verify-side semantic — not part of the wire claims, stays in the SDK. */
export type TokenScope = "user" | "tenant";

export type { AllowlistRole };
