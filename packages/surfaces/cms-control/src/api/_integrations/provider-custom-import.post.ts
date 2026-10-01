import type { ControlCms } from "cms-control/ControlCms";
import InvalidParam from "cms-control/core/admin/http/errors/InvalidParam";
import { readJsonBody } from "cms-control/core/admin/http/readJsonBody";
import { requireProviderManagement } from "cms-control/core/admin/providerResources/management";

const MAX_MANIFEST_BYTES = 512 * 1024;

export default async function importCustomProvider(request: Request, cms: ControlCms): Promise<Response> {
    const { management } = await requireProviderManagement(request, cms);
    const body = await readJsonBody(request);
    if (
        Object.keys(body).length !== 1 ||
        typeof body.manifest !== "string" ||
        new TextEncoder().encode(body.manifest).byteLength > MAX_MANIFEST_BYTES
    ) {
        throw new InvalidParam("body", "A provider manifest of at most 512 KiB is required");
    }
    return Response.json(await management.importManifest(body.manifest), { status: 201 });
}
