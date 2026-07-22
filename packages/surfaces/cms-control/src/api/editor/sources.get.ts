import { parseUrn, sourceEndpointAccessMode, type SourceEndpoint } from "@bernouy/cms-sources";
import type { ControlCms } from "cms-control/ControlCms";
import { editorSourceFromEndpoint } from "cms-control/core/content/editorSources/sourceDto";

export type {
    EditorSourceBodyDto,
    EditorSourceBodyFieldDto,
    EditorSourceDto,
    EditorSourceParamDto,
} from "cms-control/core/content/editorSources/types";

export default async function getEditorSources(_req: Request, cms: ControlCms): Promise<Response> {
    try {
        const providers = await cms.sources.getAllSources();
        const sources = providers.flatMap((provider) => {
            const parsed = parseUrn(provider.urn);
            const descriptor = {
                provider: parsed?.source ?? provider.urn,
                providerUrn: provider.urn,
                providerLabel: provider.meta?.name,
            };
            return provider.endpoints
                .filter(isEditorEndpoint)
                .map((endpoint) => editorSourceFromEndpoint(cms, endpoint, descriptor));
        });

        return Response.json(sources);
    } catch (error) {
        if (error instanceof Error && error.message === "sources repository not configured") {
            return Response.json([]);
        }
        throw error;
    }
}

function isEditorEndpoint(endpoint: SourceEndpoint): boolean {
    const mode = sourceEndpointAccessMode(endpoint);
    return mode === "public" || mode === "auth";
}
