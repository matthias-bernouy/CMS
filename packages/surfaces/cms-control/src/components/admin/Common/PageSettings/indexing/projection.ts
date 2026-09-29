import type { PageIndexingSelectionUpdate } from "cms-control/core/content/page/indexing/pageIndexingSelection";

export function readIndexingProjection(root: ShadowRoot | null): PageIndexingSelectionUpdate["projection"] {
    const get = (name: string) =>
        root?.querySelector<HTMLInputElement | HTMLSelectElement>(`[data-projection="${name}"]`)?.value.trim() ?? "";
    const identityPath = get("identityPath");
    const selected = get("discoverCapability");
    if (!selected) {
        return identityPath ? { identityPath } : {};
    }
    const capabilityId = selected.split("|")[1] ?? "";
    const paginationType = get("paginationType");
    const pageSize = Number(get("pageSize"));
    const pagination =
        paginationType === "offset"
            ? {
                  type: "offset" as const,
                  limitParam: get("limitParam"),
                  offsetParam: get("offsetParam"),
                  pageSize,
                  ...(get("totalPath") ? { totalPath: get("totalPath") } : {}),
              }
            : paginationType === "cursor"
              ? {
                    type: "cursor" as const,
                    cursorParam: get("cursorParam"),
                    nextCursorPath: get("nextCursorPath"),
                    limitParam: get("limitParam"),
                    pageSize,
                }
              : undefined;
    return {
        ...(identityPath ? { identityPath } : {}),
        discover: {
            capabilityId,
            itemsPath: get("itemsPath"),
            identityPath: get("discoverIdentityPath"),
            ...(get("lastModifiedPath") ? { lastModifiedPath: get("lastModifiedPath") } : {}),
            ...(pagination ? { pagination } : {}),
        },
    };
}
