import { SYSTEM_FUNCTIONS_SOURCE_URN } from "@bernouy/cms-functions";
import { parseUrn, sourceToDto } from "@bernouy/cms-sources";
import type { ControlCms } from "cms-control/ControlCms";

export type FunctionCatalogSource = {
    id: string;
    label: string;
    endpoints: ReturnType<typeof sourceToDto>["endpoints"];
};

export default async function getFunctionCatalog(_req: Request, cms: ControlCms): Promise<Response> {
    const sources = await cms.sources.getAllSources();
    return Response.json(sources
        .filter(source => source.urn !== SYSTEM_FUNCTIONS_SOURCE_URN)
        .map(source => {
            const dto = sourceToDto(source);
            return {
                id: parseUrn(source.urn)?.source ?? dto.id,
                label: source.meta?.name ?? dto.id,
                endpoints: dto.endpoints,
            } satisfies FunctionCatalogSource;
        })
        .sort((left, right) => left.label.localeCompare(right.label)));
}
