import {
    BlocOwnershipConflictError,
    ContentValidationError,
    DuplicateBlocTagError,
    type SiteBlocDefinition,
    sameBlocOwner,
    validateSiteBlocDefinition,
} from "@bernouy/cms-content";
import type { ControlCms } from "cms-control/ControlCms";
import { importedSiteBlocCollection } from "./collections";
import { publishSiteBloc, saveSiteBloc } from "./service";
import { validateSiteBlocDraft } from "./validation/draft";

export async function importSiteBlocDefinition(
    cms: ControlCms,
    rawDefinition: string,
    expectedTag: string,
    force: boolean,
): Promise<SiteBlocDefinition> {
    const incoming = parseSiteBlocDefinition(rawDefinition);
    if (incoming.tag !== expectedTag) {
        throw new ContentValidationError("definition.tag", `expected "${expectedTag}"`);
    }
    if (incoming.lifecycle === "archived") {
        throw new ContentValidationError("definition.lifecycle", "restore an archived bloc before pushing it");
    }

    const current = await cms.repository.getBlocRecord(incoming.tag);
    let draftRevision: number;
    if (!current) {
        const draft = await validateSiteBlocDraft(cms, incoming, incoming.draft);
        const created = await cms.repository.createSiteBloc({
            ...incoming,
            collectionId: await importedSiteBlocCollection(cms, incoming.collectionId),
            draft,
            lifecycle: "active",
            publishedRevision: null,
            published: null,
            archivedAt: undefined,
        });
        draftRevision = created.siteDefinition!.draftRevision;
    } else {
        if (!sameBlocOwner(current.ownership, incoming.ownership)) {
            throw new BlocOwnershipConflictError(incoming.tag);
        }
        if (!force) {
            throw new DuplicateBlocTagError(incoming.tag);
        }
        if (!current.siteDefinition) {
            throw new BlocOwnershipConflictError(incoming.tag);
        }
        const saved = await saveSiteBloc(cms, incoming.tag, {
            expectedDraftRevision: current.siteDefinition.draftRevision,
            name: incoming.draft.name,
            group: incoming.draft.group,
            description: incoming.draft.description,
            defaultContent: incoming.draft.defaultContent,
            snapshot: incoming.draft,
        });
        draftRevision = saved.draftRevision;
    }
    return publishSiteBloc(cms, incoming.tag, draftRevision);
}

export function parseSiteBlocDefinition(raw: string): SiteBlocDefinition {
    let value: unknown;
    try {
        value = JSON.parse(raw);
    } catch {
        throw new ContentValidationError("definition", "valid JSON expected");
    }
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new ContentValidationError("definition", "object expected");
    }
    const definition = value as SiteBlocDefinition;
    return validateSiteBlocDefinition({
        ...definition,
        createdAt: dateValue(definition.createdAt, "createdAt"),
        updatedAt: dateValue(definition.updatedAt, "updatedAt"),
        ...(definition.archivedAt ? { archivedAt: dateValue(definition.archivedAt, "archivedAt") } : {}),
    });
}

function dateValue(value: unknown, field: string): Date {
    const date = value instanceof Date ? value : typeof value === "string" ? new Date(value) : new Date(Number.NaN);
    if (Number.isNaN(date.getTime())) {
        throw new ContentValidationError(`definition.${field}`, "ISO date expected");
    }
    return date;
}
