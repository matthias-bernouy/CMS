import type { Runner } from "@bernouy/core";
import { metadocPath } from "@bernouy/data-provider-contract";
import type { IssuerConfig } from "src/interfaces/IssuerConfig";
import type { KeyStore } from "src/interfaces/KeyStore";
import { buildMetadoc } from "src/core/publish/metadoc";
import { buildJwks } from "src/core/publish/jwks";

/**
 * Serve the RFC 8414 metadoc + JWKS, **public** (no auth — same as the
 * provider's discovery endpoints, base.md §2). The metadoc path is derived
 * from the SHARED `metadocPath(iss)` — byte-identical to where `_sdk`
 * `discovery.ts` fetches it (the append-convention lock).
 */
export function mountIssuer(
    runner: Runner,
    opts: { config: IssuerConfig; keyStore: KeyStore },
): void {
    const metaPath = new URL(metadocPath(opts.config.issuer)).pathname;
    const jwksPath = new URL(opts.config.jwksUri).pathname;

    runner.get(metaPath, () => Response.json(buildMetadoc(opts.config)));
    runner.get(jwksPath, async () => Response.json(await buildJwks(opts.keyStore)));
}
