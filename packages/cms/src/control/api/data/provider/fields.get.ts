import type { ControlCms } from "src/control/ControlCms";
import { getResolverFor } from "src/control/core/data/getResolverFor";
import { parseDataProxyUrl } from "src/socle/constants/p9r-constants";

/**
 * Flat list of field paths into the response schema. Hot path for the
 * richtextbar autocomplete: tiny payload (just strings), no nested
 * structures to walk client-side.
 *
 * Input is the proxy URL emitted by `<cms-schema-picker>`, of the form
 * `<DATA_PROXY_PREFIX>/<providerId>/<operationPath>`. The providerId is
 * carried in the URL itself, so no upstream-server lookup is needed —
 * the basePath prefix used by the multi-tenant edge proxy is irrelevant
 * here, since the saved value is always the relative proxy form.
 * `method` defaults to GET — most consumer blocs are GET-only.
 */
export default async function getProviderFields(req: Request, cms: ControlCms) {
    const u      = new URL(req.url);
    const target = u.searchParams.get("url");
    const method = (u.searchParams.get("method") ?? "GET").toUpperCase();
    if (!target) return new Response("Missing url", { status: 400 });

    const match = parseDataProxyUrl(target);
    if (!match) return new Response("URL is not a data-proxy URL", { status: 400 });

    const resolver = await getResolverFor(cms, match.providerId);
    if (!resolver) return new Response("Not synced", { status: 404 });

    const template = resolver.matchOperationPath(method, match.path) ?? match.path;

    return new Response(JSON.stringify(resolver.getResponseFields(`${method} ${template}`)), {
        headers: { "Content-Type": "application/json" },
    });
}
