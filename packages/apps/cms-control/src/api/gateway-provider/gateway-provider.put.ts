import type { ControlCms } from "cms-control/ControlCms";
import { readJsonBody } from "cms-control/core/http/readJsonBody";
import { parseProviderDto } from "cms-control/core/validation/gateway/parseProviderDto";
import { updateProvider } from "cms-control/core/gateway/updateProvider";

/** PUT /api/gateway-provider — full-aggregate replace of a provider (keyed by the
 *  urn derived from the body `id`; no rename). The body carries ALL endpoints —
 *  the submitted set wholly replaces the stored one. Unknown urn → 400. */
export default async function putGatewayProvider(req: Request, cms: ControlCms) {
    const body = await readJsonBody(req);
    const dto  = parseProviderDto(body);
    await updateProvider(cms, dto);
    return new Response();
}
