import { generateSiteBlocSourceBundle } from "@bernouy/cms-bloc-compile";
import {
    ContentValidationError,
    assertContentRefsExist,
    type SiteBlocDefinition,
    type SiteBlocSnapshot,
    validateSiteBlocSnapshot,
} from "@bernouy/cms-content";
import type { ControlCms } from "cms-control/ControlCms";
import type { SaveSiteBlocInput } from "cms-control/core/content/siteBloc/service";
import { hardenSiteBlocStructure, parseSiteBlocStructure } from "cms-control/core/content/siteBloc/structure";
import { validateSiteBlocDefaultContent, validateSiteBlocSlotAccepts } from "./defaultContent";
import { validateSiteBlocDependencies } from "./dependencies";

export async function validateSiteBlocDraft(
    cms: ControlCms,
    definition: SiteBlocDefinition,
    value: SiteBlocSnapshot,
): Promise<SiteBlocSnapshot> {
    const input = validateSiteBlocSnapshot(value, definition.tag);
    const hardenedStructure = hardenSiteBlocStructure(input.structure, input.slots);
    const snapshot = validateSiteBlocSnapshot({ ...input, ...hardenedStructure }, definition.tag);
    const records = await cms.repository.getBlocRecords();
    validateSiteBlocDependencies(records, definition.tag, snapshot);
    const archivedTags = new Set(
        records
            .filter((record) => record.artifact && record.siteDefinition?.lifecycle === "archived")
            .map((record) => record.tag),
    );
    const tags = new Set(
        records
            .filter((record) => record.artifact && record.siteDefinition?.lifecycle !== "archived")
            .map((record) => record.tag),
    );
    validateSiteBlocSlotAccepts(snapshot.slots, tags, archivedTags);
    const defaultContent = validateSiteBlocDefaultContent(snapshot.defaultContent, snapshot.slots, tags);
    await assertContentRefsExist(cms.repository, defaultContent);
    const validated = { ...snapshot, defaultContent };
    try {
        generateSiteBlocSourceBundle({ ...definition, draft: validated }, validated);
    } catch (error) {
        throw new ContentValidationError("draft", error instanceof Error ? error.message : String(error));
    }
    return validated;
}

export function snapshotFromEditor(input: SaveSiteBlocInput, tag: string): SiteBlocSnapshot {
    if (input.structureHtml === undefined) {
        throw new ContentValidationError("structureHtml", "required");
    }
    const { structure, slots } = parseSiteBlocStructure(input.structureHtml);
    return validateSiteBlocSnapshot(
        {
            name: input.name,
            group: input.group,
            description: input.description,
            structure,
            slots,
            defaultContent: input.defaultContent,
            dependencies: [],
        },
        tag,
    );
}
