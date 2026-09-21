import type { ControlCms } from "cms-control/ControlCms";
import InvalidParam from "cms-control/core/admin/http/errors/InvalidParam";
import { invalidateAllPages } from "cms-control/core/admin/server/cache/invalidation";
import { pagePathsDetail } from "cms-control/core/content/page/localization/pagePathsDetail";

export async function updatePagePaths(cms: ControlCms, id: string, body: Record<string, unknown>) {
    const paths = readPaths(body.paths, "paths");
    const expectedPaths = readPaths(body.expectedPaths, "expectedPaths");
    if (!cms.repository.setPagePaths) {
        throw new Error("Page path management is not available.");
    }
    await cms.repository.setPagePaths(id, paths, undefined, expectedPaths);
    invalidateAllPages(cms);
    return pagePathsDetail(cms, id);
}

function readPaths(value: unknown, field: string): Record<string, string> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new InvalidParam(field, "Expected a language-to-path object.");
    }
    const paths = value as Record<string, unknown>;
    if (Object.values(paths).some((path) => typeof path !== "string")) {
        throw new InvalidParam(field, "Every path must be a string.");
    }
    return paths as Record<string, string>;
}
