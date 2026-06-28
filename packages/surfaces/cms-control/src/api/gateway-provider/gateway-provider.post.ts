import type { ControlCms } from "cms-control/ControlCms";
import { readJsonBody } from "cms-control/core/http/readJsonBody";
import { parseSourceDto } from "cms-control/core/validation/gateway/parseSourceDto";
import { createSource, createSourceFromOpenApi } from "cms-control/core/gateway/createProvider";

/** POST /api/gateway-provider — create a gateway provider with its endpoints
 *  (flat indexed body, see `parseSourceDto`). Duplicate urn → 400. */
export default async function postGatewayProvider(req: Request, cms: ControlCms) {
    const body = await readJsonBody(req);
    if (typeof body.openapi === "string" && body.openapi.trim()) {
        await createSourceFromOpenApi(cms, body);
        return new Response();
    }
    const dto  = parseSourceDto(body);
    await createSource(cms, dto);
    return new Response();
}
