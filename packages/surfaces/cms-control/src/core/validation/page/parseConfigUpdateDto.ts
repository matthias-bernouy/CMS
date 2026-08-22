import type { PageIndexingConfiguration } from "@bernouy/cms-content";
import InvalidParam from "cms-control/core/admin/http/errors/InvalidParam";
import MissingParam from "cms-control/core/admin/http/errors/MissingParam";
import type { PageIndexingSelectionUpdate } from "cms-control/core/content/page/pageIndexingSelection";
import { coerceTags } from "./tags";
import { coerceVisible } from "./visible";

export type PageConfigUpdateDto = {
    id: string;
    title: string;
    path: string;
    description: string;
    visible: boolean;
    tags: string[];
    indexing?: PageIndexingConfiguration;
    indexingSelection?: PageIndexingSelectionUpdate;
};

export function parsePageConfigUpdateDto(id: string, body: Record<string, unknown>): PageConfigUpdateDto {
    const { title, path } = body;
    if (!title) {
        throw new MissingParam("title");
    }
    if (!path) {
        throw new MissingParam("path");
    }

    const indexingSelection = parseIndexingSelection(body);
    if (indexingSelection && body.indexing !== undefined) {
        throw new InvalidParam("indexing", "Use either indexing or the indexing form fields, not both.");
    }

    return {
        id,
        title: String(title),
        path: String(path),
        description: body.description == null ? "" : String(body.description),
        visible: coerceVisible(body.published),
        tags: coerceTags(body.tags),
        ...(body.indexing !== undefined ? { indexing: body.indexing as PageIndexingConfiguration } : {}),
        ...(indexingSelection ? { indexingSelection } : {}),
    };
}

function parseIndexingSelection(body: Record<string, unknown>): PageIndexingSelectionUpdate | undefined {
    if (body.indexingEnabled === undefined) {
        return undefined;
    }
    const candidate = String(body.indexingCandidate ?? "").trim();
    const enabled = String(body.indexingEnabled);
    if (enabled !== "true" && enabled !== "false") {
        throw new InvalidParam("indexingEnabled", "Expected true or false.");
    }
    return {
        enabled: enabled === "true",
        ...(candidate ? { candidate } : {}),
    };
}
