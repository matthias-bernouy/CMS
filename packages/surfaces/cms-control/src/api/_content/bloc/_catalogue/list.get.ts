import type { ControlCms } from "cms-control/ControlCms";
import { cliBlocList } from "cms-control/core/content/bloc/cliExport";

/**
 * Lightweight CLI inventory. Site-builder drafts are included before their
 * first publication and expose current draft metadata, so pull is lossless.
 * Compiled JavaScript is deliberately omitted.
 */
export default async function getBlocsList(_req: Request, cms: ControlCms) {
    const blocs = await cliBlocList(cms.repository);
    return new Response(JSON.stringify(blocs), {
        headers: { "Content-Type": "application/json" },
    });
}
