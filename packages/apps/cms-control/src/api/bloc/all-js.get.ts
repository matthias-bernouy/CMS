import type { ControlCms } from "cms-control/ControlCms";

/**
 * Returns the editor + view JS for every registered bloc as
 * `{id, editorJS, viewJS}[]`. Consumed by `p9r dev` to merge remote blocs
 * with locally-built dev blocs in the editor-script bundle. Heavier than
 * `bloc/list.get.ts` (which is metadata-only) — only the dev CLI hits it.
 */
export default async function getBlocsAllJs(_req: Request, cms: ControlCms) {
    const blocs = await cms.repository.getBlocsJS();
    return new Response(JSON.stringify(blocs), {
        headers: { "Content-Type": "application/json" },
    });
}
