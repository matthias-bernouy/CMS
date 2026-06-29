import type { ControlCms } from "cms-control/ControlCms";
import MissingParam from "cms-control/errors/Http/MissingParam";
import InvalidParam from "cms-control/errors/Http/InvalidParam";
import { isSystemSourceUrn, sourceToDto } from "@bernouy/cms-sources";

export default async function getSource(req: Request, cms: ControlCms) {
    const urn = new URL(req.url).searchParams.get("urn");
    if (!urn) throw new MissingParam("urn");

    const source = await cms.sources.getSource(urn);
    if (!source) throw new InvalidParam("urn", "Unknown source.");

    const dto = sourceToDto(source);
    const endpointsJson = JSON.stringify(dto.endpoints);
    const readonly = isSystemSourceUrn(source.urn);
    const name = source.meta?.name ?? dto.id;

    return new Response(JSON.stringify({
        ...source,
        id: dto.id,
        name,
        endpoints: dto.endpoints,
        endpointCount: dto.endpoints.length,
        endpointsJson,
        readonly,
        editableStyle:       readonly ? "display:none;" : "",
        readonlyNoticeStyle: readonly ? "" : "display:none;",
    }), {
        headers: { "Content-Type": "application/json" },
    });
}
