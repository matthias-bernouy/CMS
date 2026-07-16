import { SYSTEM_FUNCTIONS_SOURCE_URN } from "@bernouy/cms-functions";
import { parseUrn, sourceToDto } from "@bernouy/cms-sources";
import type { ControlCms } from "cms-control/ControlCms";

export type FunctionCatalogSource = {
    id: string;
    label: string;
    endpoints: ReturnType<typeof sourceToDto>["endpoints"];
};

export async function functionCatalog(cms: ControlCms): Promise<FunctionCatalogSource[]> {
    const sources = await cms.sources.getAllSources();
    return sources
        .filter(source => source.urn !== SYSTEM_FUNCTIONS_SOURCE_URN)
        .map(source => {
            const dto = sourceToDto(source);
            return {
                id: parseUrn(source.urn)?.source ?? dto.id,
                label: source.meta?.name ?? dto.id,
                endpoints: dto.endpoints,
            };
        })
        .sort((left, right) => left.label.localeCompare(right.label));
}
