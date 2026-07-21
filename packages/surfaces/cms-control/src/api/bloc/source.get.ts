import type { ControlCms } from "cms-control/ControlCms";
import MissingParam from "cms-control/errors/Http/MissingParam";

/**
 * Returns the author-side source bundle for a bloc, used by `p9r pull` to
 * reconstruct the editable folder under `site/blocs/<tag>/`.
 *
 * Response:
 *   - `200 { source: { "<path>": "<base64>" } }` when the bloc has a bundle
 *   - `404 { error: "no source bundle" }` when no source bundle is stored
 *
 * The bundle is whatever the CLI walked at push time (excluding `node_modules`,
 * `dist`, dotfiles). Binary files are base64-encoded.
 */
export default async function getBlocSource(req: Request, cms: ControlCms) {
    const url = new URL(req.url);
    const tag = url.searchParams.get("tag");
    if (!tag) {
        throw new MissingParam("tag");
    }

    const source = await cms.repository.getBlocSource(tag);
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
