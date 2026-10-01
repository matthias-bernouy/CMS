import type { ControlCms } from "cms-control/ControlCms";
import InvalidParam from "cms-control/core/admin/http/errors/InvalidParam";
import { readJsonBody } from "cms-control/core/admin/http/readJsonBody";
import { requireProviderManagement } from "cms-control/core/admin/providerResources/management";

export default async function updateProviderStatus(request: Request, cms: ControlCms): Promise<Response> {
    const { management } = await requireProviderManagement(request, cms);
    const body = await readJsonBody(request);
    if (
        Object.keys(body).some((key) => !["installationId", "revision", "action"].includes(key)) ||
        typeof body.installationId !== "string" ||
        !Number.isSafeInteger(body.revision) ||
        Number(body.revision) < 1 ||
        !["enable", "disable", "revoke"].includes(String(body.action))
    ) {
        throw new InvalidParam("body", "Provider installation, revision and lifecycle action expected");
    }
    return Response.json(
        await management.setStatus({
            installationId: body.installationId,
            revision: Number(body.revision),
            action: body.action as "enable" | "disable" | "revoke",
        }),
    );
}
