import type { ControlCms } from "src/control/ControlCms";
import InvalidParam from "src/control/errors/Http/InvalidParam";
import MissingParam from "src/control/errors/Http/MissingParam";
import { readJsonBody } from "src/control/core/http/readJsonBody";
import { getResolverFor } from "src/control/core/data/getResolverFor";
import { stubFromSchema } from "src/control/core/data/stubFromSchema";

/**
 * Editor-side fetch proxy contract. The editor calls this for every
 * request a bloc would make against a registered data provider:
 *
 *   POST /api/data/mock
 *   { providerId, method, path }
 *
 * `path` is the operation path baked into the proxy URL by the page —
 * already stripped of the `<DATA_PROXY_PREFIX>/<providerId>` prefix and
 * the query string by `installFetchProxy`. No upstream URL ever reaches
 * this endpoint, so no `provider.server` lookup is needed here.
 *
 * The response mirrors the shape the real API would have returned: HTTP
 * status from the active mockup (or 200 when synthesizing a stub) and
 * `application/json` body. The editor proxy can therefore use the
 * response as-is without unwrapping.
 *
 * Resolution order:
 *   1. `path` → templated path via `SpecResolver.matchOperationPath`.
 *   2. Active mockup for that operation → return body+status verbatim.
 *   3. Otherwise → 200 + synthesized stub from the 200-response schema.
 *   4. No matching operation in the spec → 404.
 */
export default async function postDataMock(req: Request, cms: ControlCms) {
    const body = await readJsonBody(req);
    const { providerId, method, path } = body;
    if (!providerId) throw new MissingParam("providerId");
    if (!method)     throw new MissingParam("method");
    if (!path)       throw new MissingParam("path");

    if (typeof providerId !== "string") throw new InvalidParam("providerId", "Must be a string.");
    if (typeof method     !== "string") throw new InvalidParam("method",     "Must be a string.");
    if (typeof path       !== "string") throw new InvalidParam("path",       "Must be a string.");

    const provider = await cms.repository.getDataProvider(providerId);
    if (!provider) return jsonError(404, "Unknown provider.");

    const resolver = await getResolverFor(cms, providerId);
    if (!resolver) return jsonError(404, "Provider has no synced spec.");

    const verbUpper = method.toUpperCase();
    const operationPath = path.split("?")[0] || "/";
    const template  = resolver.matchOperationPath(verbUpper, operationPath);
    if (!template) return jsonError(404, `No operation matches ${verbUpper} ${operationPath}`);

    const active = await cms.repository.getActiveMockup(providerId, verbUpper, template);
    if (active) {
        return new Response(active.body, {
            status:  active.status,
            headers: { "Content-Type": "application/json" },
        });
    }

    const schema = resolver.getResponseSchema(`${verbUpper} ${template}`);
    return new Response(JSON.stringify(stubFromSchema(schema)), {
        status:  200,
        headers: { "Content-Type": "application/json" },
    });
}

function jsonError(status: number, message: string): Response {
    return new Response(JSON.stringify({ error: message }), {
        status,
        headers: { "Content-Type": "application/json" },
    });
}
