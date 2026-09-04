import type { ControlCms } from "cms-control/ControlCms";

/**
 * Returns the editor + view JS for every registered bloc as
 * `{id, editorJS, viewJS}[]`. This compatibility endpoint is heavier than
 * `bloc/list.get.ts`, which is metadata-only.
 */
export default async function getBlocsAllJs(_req: Request, cms: ControlCms) {
    const blocs = await cms.repository.getBlocsJS();
    return new Response(JSON.stringify(blocs), {
        headers: { "Content-Type": "application/json" },
    });
}
