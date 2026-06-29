import type { ControlCms } from "cms-control/ControlCms";
import { isSystemSourceUrn, parseUrn } from "@bernouy/cms-sources";

export default async function listSources(_req: Request, cms: ControlCms) {
    const sources = await cms.sources.getAllSources();
    const rows = sources.map(source => {
        const id = parseUrn(source.urn)?.source ?? "";
        return {
            urn: source.urn,
            id,
            name: source.meta?.name ?? id,
            endpointCount: source.endpoints.length,
            readonly: isSystemSourceUrn(source.urn),
        };
    });
    return new Response(JSON.stringify(rows), {
        headers: { "Content-Type": "application/json" },
    });
}
