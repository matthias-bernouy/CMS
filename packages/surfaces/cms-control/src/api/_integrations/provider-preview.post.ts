import type { ControlCms } from "cms-control/ControlCms";
import InvalidParam from "cms-control/core/admin/http/errors/InvalidParam";
import { readJsonBody } from "cms-control/core/admin/http/readJsonBody";
import { requireProviderManagement } from "cms-control/core/admin/providerResources/management";

export default async function previewProvider(request: Request, cms: ControlCms): Promise<Response> {
    const { management, actorId } = await requireProviderManagement(request, cms);
    const body = await readJsonBody(request);
    if (
        Object.keys(body).some((key) => !["providerId", "version", "endpoint", "token"].includes(key)) ||
        typeof body.providerId !== "string" ||
        typeof body.version !== "string" ||
        typeof body.endpoint !== "string" ||
        typeof body.token !== "string" ||
        body.token.length < 20 ||
        body.token.length > 512
    ) {
        throw new InvalidParam("body", "Provider ID, manifest version, endpoint and token expected");
    }
    return Response.json(
        await management.preview(
            {
                providerId: body.providerId,
                version: body.version,
                endpoint: body.endpoint,
                token: body.token,
            },
            actorId,
        ),
    );
}
