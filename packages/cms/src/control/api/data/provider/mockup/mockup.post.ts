import type { ControlCms } from "src/control/ControlCms";
import { readJsonBody } from "src/control/core/http/readJsonBody";
import { parseDataMockupCreateDto } from "src/control/core/validation/dataMockup/parseCreateDto";
import { createMockup } from "src/control/core/dataMockup/createMockup";

/**
 * Create a mockup. `providerId`, `method`, `path` and `id` (alias for
 * providerId) may be supplied via query string — the admin form forwards
 * them automatically through `buildRequestUrl`. Body fields override
 * query-string values when both are present.
 */
export default async function postProviderMockup(req: Request, cms: ControlCms) {
    const url    = new URL(req.url);
    const body   = await readJsonBody(req);
    const merged = {
        ...body,
        providerId: body.providerId ?? url.searchParams.get("providerId") ?? url.searchParams.get("id") ?? undefined,
        method:     body.method     ?? url.searchParams.get("method")     ?? undefined,
        path:       body.path       ?? url.searchParams.get("path")       ?? undefined,
    };
    const dto    = parseDataMockupCreateDto(merged);
    const mockup = await createMockup(cms, dto);
    return new Response(JSON.stringify(mockup), {
        headers: { "Content-Type": "application/json" },
    });
}
