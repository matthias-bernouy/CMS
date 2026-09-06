import type { ControlCms } from "cms-control/ControlCms";
import MissingParam from "cms-control/core/admin/http/errors/MissingParam";
import { cliBlocSource } from "cms-control/core/content/bloc/cliExport";

/**
 * Returns the author-side source bundle for explicit resource export and
 * provenance tooling.
 *
 * Response:
 *   - `200 { source: { "<path>": "<base64>" } }` when the bloc has a bundle
 *   - `404 { error: "no source bundle" }` when no source bundle is stored
 *
 * Code-managed bundles are returned as stored. Builder bundles retain the
 * published source files while `builder.json` reflects the current canonical
 * definition.
 */
export default async function getBlocSource(req: Request, cms: ControlCms) {
    const url = new URL(req.url);
    const tag = url.searchParams.get("tag");
    if (!tag) {
        throw new MissingParam("tag");
    }

    const source = await cliBlocSource(cms.repository, tag);
    if (!source) {
        return new Response(JSON.stringify({ error: "no source bundle" }), {
            status: 404,
            headers: { "Content-Type": "application/json" },
        });
    }
    return new Response(JSON.stringify({ source }), {
        headers: { "Content-Type": "application/json" },
    });
}
