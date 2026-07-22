import type { SourceOverlayRepository } from "@bernouy/cms-sources";
import type { ControlCms } from "cms-control/ControlCms";

type SourceOverlayCms = ControlCms & {
    sourceOverlays?: SourceOverlayRepository | null;
};

export default async function listSourceOverlays(req: Request, cms: ControlCms): Promise<Response> {
    const repository = (cms as SourceOverlayCms).sourceOverlays;
    if (!repository) {
        return new Response("source overlays not configured", { status: 501 });
    }

    const sourceId = new URL(req.url).searchParams.get("sourceId")?.trim();
    const overlays = sourceId ? await repository.getOverlaysForSource(sourceId) : await repository.getAllOverlays();
    return new Response(JSON.stringify(overlays), {
        headers: { "Content-Type": "application/json" },
    });
}
