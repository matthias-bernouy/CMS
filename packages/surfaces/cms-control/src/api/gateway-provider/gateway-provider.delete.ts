import type { ControlCms } from "cms-control/ControlCms";
import MissingParam from "cms-control/errors/Http/MissingParam";
import InvalidParam from "cms-control/errors/Http/InvalidParam";

/** DELETE /api/gateway-provider?urn= — remove a provider (its endpoints go with the
 *  aggregate). Uses the throw-error-class envelope (unlike `template.delete`'s raw
 *  Response) so the error shape stays consistent. Unknown urn → 400. */
export default async function deleteGatewayProvider(req: Request, cms: ControlCms) {
    const urn = new URL(req.url).searchParams.get("urn");
    if (!urn) throw new MissingParam("urn");

    const ok = await cms.gateway.deleteProvider(urn);
    if (!ok) throw new InvalidParam("urn", "unknown provider");

    return new Response("Deleted", { status: 200 });
}
