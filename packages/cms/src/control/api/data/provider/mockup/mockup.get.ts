import type { ControlCms } from "src/control/ControlCms";
import MissingParam from "src/control/errors/Http/MissingParam";

export default async function getProviderMockup(req: Request, cms: ControlCms) {
    const url    = new URL(req.url);
    const id     = url.searchParams.get("id");
    const method = url.searchParams.get("method");
    const path   = url.searchParams.get("path");
    const name   = url.searchParams.get("name");
    if (!id)     throw new MissingParam("id");
    if (!method) throw new MissingParam("method");
    if (!path)   throw new MissingParam("path");
    if (!name)   throw new MissingParam("name");

    const mockup = await cms.repository.getMockup(id, method, path, name);
    if (!mockup) return new Response("Not found", { status: 404 });

    return new Response(JSON.stringify(mockup), {
        headers: { "Content-Type": "application/json" },
    });
}
