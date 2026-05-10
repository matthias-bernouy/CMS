import { wrapAdmin } from "../../../core/admin/wrapAdmin";
import type { BucketProxy } from "../../../interfaces/entities/BucketProxy";
import type { RulesConfig } from "../../../interfaces/proxy/RulesConfig";

/**
 * GET /admin/api/proxies/list?bucketId=<id>
 *
 * Returns the proxies with secrets **redacted to names only** — only
 * the env-var keys are sent, never the cleartext. The admin UI uses
 * the names to render "configured" markers; updates go through
 * `POST /admin/api/proxies` with full cleartext.
 *
 * `rules` itself carries no secrets (only `${env:NAME}` references), so
 * it ships verbatim.
 */
export default wrapAdmin(async (req, provider) => {
    const bucketId = new URL(req.url).searchParams.get("bucketId");
    if (!bucketId) throw new TypeError("Missing 'bucketId' query param.");
    const proxies = await provider.bucketProxyRepo.list(bucketId);
    return proxies.map(redact);
});

type RedactedProxy = {
    bucketId:    string;
    providerId:  string;
    server:      string;
    rules:       RulesConfig;
    secretNames: string[];
    /** Pre-computed for the admin UI (the w13c-fetch templating doesn't
     *  do pipes). `<N> paths · <M> secrets (a, b, c)` is the readable
     *  summary; raw counts and names are still in `rules` / `secretNames`
     *  if a caller wants them. */
    summary:     string;
    createdAt:   Date;
    updatedAt:   Date;
};

function redact(p: BucketProxy): RedactedProxy {
    const secretNames = Object.keys(p.secrets).sort();
    const pathCount   = Object.keys(p.rules.paths).length;
    const secretsSuffix = secretNames.length > 0 ? ` (${secretNames.join(", ")})` : "";
    const summary = `${pathCount} path${pathCount === 1 ? "" : "s"} · `
                  + `${secretNames.length} secret${secretNames.length === 1 ? "" : "s"}${secretsSuffix}`;
    return {
        bucketId:    p.bucketId,
        providerId:  p.providerId,
        server:      p.server,
        rules:       p.rules,
        secretNames,
        summary,
        createdAt:   p.createdAt,
        updatedAt:   p.updatedAt,
    };
}
