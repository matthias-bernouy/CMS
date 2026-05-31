import type { ControlCms } from "cms-control/ControlCms";
import MissingParam from "cms-control/errors/Http/MissingParam";
import InvalidParam from "cms-control/errors/Http/InvalidParam";
import { parseUrn } from "@bernouy/cms-gateway";

/**
 * GET /api/gateway-provider?urn= — the full provider, enriched for the edit page.
 *
 * The persisted `Provider` carries only `urn` (no plain `id`), and the admin's
 * template interpolation has no array→JSON path, so the response adds:
 *  - a top-level derived `id` (so the edit form's hidden `<input name="id">` binds);
 *  - a per-endpoint derived `endpointId` (the create-form field, stripped from the urn);
 *  - `endpointsJson`, a pre-stringified `[{endpointId,method,targetUrl}]` the
 *    `<cms-endpoints-input value="{{endpointsJson}}">` parses on connect.
 * All of this is response-only — nothing extra is persisted, and the parser still
 * never reads urn.
 */
export default async function getGatewayProvider(req: Request, cms: ControlCms) {
    const urn = new URL(req.url).searchParams.get("urn");
    if (!urn) throw new MissingParam("urn");

    const provider = await cms.gateway.getProvider(urn);
    if (!provider) throw new InvalidParam("urn", "Unknown provider.");

    const id = parseUrn(provider.urn)?.provider ?? "";
    const endpoints = provider.endpoints.map(e => ({
        endpointId: parseUrn(e.urn)?.endpoint ?? "",
        method:     e.method,
        targetUrl:  e.targetUrl,
        // Flatten input.params (scalar `type` lifted out of `schema`) so the
        // editor can prefill the In tab's param rows.
        params: (e.input?.params ?? []).map(p => ({
            name:     p.name,
            in:       p.in,
            type:     p.schema?.type ?? "string",
            required: !!p.required,
            ...(p.description ? { description: p.description } : {}),
        })),
        // Recursive shapes + endpoint meta ride along verbatim so the editor can
        // prefill the body tree and round-trip the (editor-less) output/meta (B1 fix).
        ...(e.input?.body ? { body: e.input.body } : {}),
        ...(e.output ? { output: e.output } : {}),
        ...(e.meta ? { meta: e.meta } : {}),
    }));
    const endpointsJson = JSON.stringify(endpoints);

    return new Response(JSON.stringify({ ...provider, id, endpoints, endpointsJson }), {
        headers: { "Content-Type": "application/json" },
    });
}
