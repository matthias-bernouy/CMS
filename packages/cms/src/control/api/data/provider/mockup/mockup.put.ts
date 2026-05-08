import type { ControlCms } from "src/control/ControlCms";
import MissingParam from "src/control/errors/Http/MissingParam";
import { readJsonBody } from "src/control/core/http/readJsonBody";
import { parseDataMockupUpdateDto } from "src/control/core/validation/dataMockup/parseUpdateDto";

export default async function putProviderMockup(req: Request, cms: ControlCms) {
    const url    = new URL(req.url);
    const id     = url.searchParams.get("id");
    const method = url.searchParams.get("method");
    const path   = url.searchParams.get("path");
    const name   = url.searchParams.get("name");
    if (!id)     throw new MissingParam("id");
    if (!method) throw new MissingParam("method");
    if (!path)   throw new MissingParam("path");
    if (!name)   throw new MissingParam("name");

    const body    = await readJsonBody(req);
    const patch   = parseDataMockupUpdateDto(body);
    const updated = await cms.repository.updateMockup(id, method, path, name, patch);
    if (!updated) return new Response("Not found", { status: 404 });

    return new Response(JSON.stringify(updated), {
        headers: { "Content-Type": "application/json" },
    });
}
