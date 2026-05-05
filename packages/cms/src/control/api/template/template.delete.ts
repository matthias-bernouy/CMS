import type { ControlCms } from "src/control/ControlCms";

export default async function deleteTemplate(req: Request, cms: ControlCms) {
    const url = new URL(req.url);
    const id = url.searchParams.get("id");

    if (!id) return new Response("Missing id", { status: 400 });

    await cms.repository.deleteTemplate(id);
    return new Response("Deleted", { status: 200 });
}
