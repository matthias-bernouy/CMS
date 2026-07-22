import type { ControlCms } from "cms-control/ControlCms";

/**
 * Lightweight bloc metadata endpoint. Returns `{id, name, group, description}`
 * for every registered bloc — no compiled JS payloads. Consumed by CLI
 * push/pull flows for validation and source materialization.
 */
export default async function getBlocsList(_req: Request, cms: ControlCms) {
    const blocs = await cms.repository.getBlocsList();
    return new Response(JSON.stringify(blocs), {
        headers: { "Content-Type": "application/json" },
    });
}
