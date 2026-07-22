import type { SourceOverlayRepository } from "@bernouy/cms-sources";
import type { ControlCms } from "cms-control/ControlCms";
import { readJsonBody } from "cms-control/core/admin/http/readJsonBody";
import { parseSourceOverlayDto } from "cms-control/core/validation/sourceOverlay/parseSourceOverlayDto";

type SourceOverlayCms = ControlCms & {
    sourceOverlays?: SourceOverlayRepository | null;
};

export default async function upsertSourceOverlay(req: Request, cms: ControlCms): Promise<Response> {
    const repository = (cms as SourceOverlayCms).sourceOverlays;
    if (!repository) {
        return new Response("source overlays not configured", { status: 501 });
    }

    const body = await readJsonBody(req);
    const overlay = parseSourceOverlayDto(body);
    const saved = await repository.upsertOverlay(overlay);
    return new Response(JSON.stringify(saved), {
        headers: { "Content-Type": "application/json" },
    });
}
