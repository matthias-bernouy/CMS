import type { Source } from "cms-sources/interfaces/Source";
import { type SourceOverlay, type SourceOverlayField } from "cms-sources/interfaces/SourceOverlay";
import { executeEndpoint, type ExecutorDeps } from "cms-sources/core/execution/executeEndpoint";
import type { SourceOverlaySchemaCache } from "cms-sources/core/repositories/SourceOverlaySchemaCache";
import { parseUrn } from "cms-sources/core/system/urn";
import { fieldsFromBody } from "./sourceOverlayFieldParsing";

export async function materializeSourceOverlays(
    source: Source,
    overlays: readonly SourceOverlay[],
    deps?: ExecutorDeps,
    cache?: SourceOverlaySchemaCache,
): Promise<SourceOverlay[]> {
    return Promise.all(overlays.map((overlay) => materializeSourceOverlay(source, overlay, deps, cache)));
}

export async function materializeSourceOverlay(
    source: Source,
    overlay: SourceOverlay,
    deps?: ExecutorDeps,
    cache?: SourceOverlaySchemaCache,
): Promise<SourceOverlay> {
    if (!overlay.fieldSource) {
        return structuredClone(overlay);
    }

    const load = () => loadSourceOverlayFields(source, overlay, deps);
    const fields = cache ? await cache.getOrLoad(source, overlay, load) : await load();
    return { ...structuredClone(overlay), fields: fields ?? [] };
}

async function loadSourceOverlayFields(
    source: Source,
    overlay: SourceOverlay,
    deps?: ExecutorDeps,
): Promise<SourceOverlayField[] | null> {
    const fieldSource = overlay.fieldSource;
    if (!fieldSource) {
        return null;
    }
    const endpoint = source.endpoints.find((candidate) => parseUrn(candidate.urn)?.endpoint === fieldSource.endpointId);
    if (!endpoint) {
        return null;
    }

    const requestUrl = new URL("http://cms.local/source-overlay-fields");
    for (const [name, value] of Object.entries(fieldSource.params ?? {})) {
        requestUrl.searchParams.set(name, value);
    }
    const request = new Request(requestUrl, {
        method: endpoint.method,
        headers: { accept: "application/json" },
    });
    const response = await executeEndpoint(endpoint, request, deps);
    if (!response.ok) {
        return null;
    }

    const body = await response.json().catch(() => null);
    return fieldsFromBody(body, fieldSource.path ?? "fields", fieldSource.map);
}
