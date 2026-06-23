import type { ControlCms } from "cms-control/ControlCms";
import { readJsonBody } from "cms-control/core/http/readJsonBody";
import { parseProviderDto } from "cms-control/core/validation/gateway/parseProviderDto";
import { createProvider, createProviderFromOpenApi } from "cms-control/core/gateway/createProvider";

/** POST /api/gateway-provider — create a gateway provider with its endpoints
 *  (flat indexed body, see `parseProviderDto`). Duplicate urn → 400. */
export default async function postGatewayProvider(req: Request, cms: ControlCms) {
    const body = await readJsonBody(req);
    if (typeof body.openapi === "string" && body.openapi.trim()) {
        await createProviderFromOpenApi(cms, body);
        return new Response();
    }
    const dto  = parseProviderDto(body);
    await createProvider(cms, dto);
    return new Response();
}
