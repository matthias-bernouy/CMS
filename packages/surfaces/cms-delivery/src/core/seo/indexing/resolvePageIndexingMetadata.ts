import { projectResolvedIndexingEntity, type TPage } from "@bernouy/cms-content/rendering";
import type { PageRenderMetadata } from "cms-delivery/core/seo/pageMetadata";

export type IndexingEndpointExecutor = (
    contractId: string,
    capabilityId: string,
    input: Readonly<Record<string, string | number>>,
) => Promise<Response>;

export type PageIndexingMetadataResult =
    | { kind: "render"; dynamic: boolean; metadata: PageRenderMetadata }
    | { kind: "not-found" }
    | { kind: "invalid-identity"; status: 400 | 422 }
    | { kind: "unavailable"; reason: string };

export async function resolvePageIndexingMetadata(
    request: Request,
    page: TPage,
    execute: IndexingEndpointExecutor | null | undefined,
): Promise<PageIndexingMetadataResult> {
    const binding = page.indexing?.entity;
    const indexable = page.indexing?.enabled !== false;
    if (!binding) {
        return { kind: "render", dynamic: false, metadata: { indexable } };
    }
    const values = new URL(request.url).searchParams.getAll(binding.pageQueryParam);
    if (values.length !== 1 || !values[0]) {
        return {
            kind: "render",
            dynamic: true,
            metadata: { canonical: null, indexable: false, fallbackTitle: binding.label },
        };
    }
    if (!execute) {
        return { kind: "unavailable", reason: "gateway runtime is not configured" };
    }
    try {
        const response = await execute(binding.contractId, binding.resolve.capabilityId, {
            [binding.resolve.inputParam]: values[0],
        });
        if (response.status === 404) {
            await discardResponseBody(response);
            return { kind: "not-found" };
        }
        if (response.status === 400 || response.status === 422) {
            await discardResponseBody(response);
            return { kind: "invalid-identity", status: response.status };
        }
        if (!response.ok) {
            await discardResponseBody(response);
            return { kind: "unavailable", reason: `indexing capability returned ${response.status}` };
        }
        const projected = projectResolvedIndexingEntity(binding, await response.json());
        if (!projected) {
            return { kind: "unavailable", reason: "indexing response does not contain its identity" };
        }
        const contentTitle = projected.variables.title;
        return {
            kind: "render",
            dynamic: true,
            metadata: {
                canonical: { queryParam: binding.pageQueryParam, value: projected.identity },
                content: projected.variables,
                fallbackTitle: typeof contentTitle === "string" && contentTitle.trim() ? contentTitle : binding.label,
                indexable,
            },
        };
    } catch {
        return { kind: "unavailable", reason: "indexing resolution failed" };
    }
}

async function discardResponseBody(response: Response): Promise<void> {
    try {
        await response.body?.cancel();
    } catch {
        // The result is discarded even when an upstream stream already failed.
    }
}
