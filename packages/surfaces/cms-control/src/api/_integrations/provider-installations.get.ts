import type { ControlCms } from "cms-control/ControlCms";
import { requireProviderManagement } from "cms-control/core/admin/providerResources/management";

export default async function providerInstallations(request: Request, cms: ControlCms): Promise<Response> {
    const { management } = await requireProviderManagement(request, cms);
    return Response.json(await management.list(), { headers: { "Cache-Control": "private, no-store" } });
}
