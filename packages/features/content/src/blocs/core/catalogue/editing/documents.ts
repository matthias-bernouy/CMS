import type { z } from "zod";
import type {
    siteBlocUpdateInputSchema,
    siteBlocDocumentSchema,
    siteBlocIdentitySchema,
} from "content/application/schemas/site";
import type { ContentRepository } from "content/application/interfaces/ContentRepository";
import type { SiteBlocDefinition, SiteBlocSnapshot } from "content/blocs/interfaces/blocs";
import { ContentValidationError, SiteBlocNotFoundError } from "content/application/core/validation/errors";
import { checkSnapshotBytes } from "content/blocs/core/validation/snapshot/budget";
import { projectSiteBloc } from "content/blocs/core/catalogue/siteBlocContracts";

export async function readCmsSiteBloc(repository: Pick<ContentRepository, "getBlocRecord">, input: { tag: string }) {
    const record = await repository.getBlocRecord(input.tag);
    if (!record?.siteDefinition || record.ownership.kind !== "site-builder") {
        throw new SiteBlocNotFoundError(input.tag);
    }
    return projectSiteBlocDocument(record.siteDefinition);
}

export async function readCmsSiteBlocIdentity(
    repository: Pick<ContentRepository, "getBlocRecord">,
    input: { tag: string },
) {
    const record = await repository.getBlocRecord(input.tag);
    if (!record?.siteDefinition || record.ownership.kind !== "site-builder") {
        throw new SiteBlocNotFoundError(input.tag);
    }
    return projectIdentity(record.siteDefinition);
}

export async function updateCmsSiteBloc(
    repository: Pick<ContentRepository, "saveSiteBlocDraft" | "getBlocRecord">,
    input: z.input<typeof siteBlocUpdateInputSchema>,
) {
    if (typeof input.definitionId !== "string" || !input.definitionId.trim() || input.definitionId.length > 200) {
        throw new ContentValidationError("definitionId", "the identity returned by site-blocs.read is required");
    }
    const draft = parseSiteBlocDocument(input.draftJson);
    if (!Number.isSafeInteger(input.revision) || input.revision < 1 || input.revision >= Number.MAX_SAFE_INTEGER) {
        throw new ContentValidationError("revision", "a positive, incrementable revision is required");
    }
    const record = await repository.getBlocRecord(input.tag);
    if (!record) {
        throw new SiteBlocNotFoundError(input.tag);
    }
    if (!record.siteDefinition || record.ownership.kind !== "site-builder" || record.contributionId) {
        throw new ContentValidationError("tag", "only site-owned compositions can be edited");
    }
    return projectSiteBloc(await repository.saveSiteBlocDraft(input.tag, draft, input.revision, input.definitionId));
}

function projectIdentity(definition: SiteBlocDefinition): z.output<typeof siteBlocIdentitySchema> {
    return {
        ...projectSiteBloc(definition),
        groupId: definition.groupId ?? null,
        definitionId: definition.id,
    };
}

function projectSiteBlocDocument(definition: SiteBlocDefinition): z.output<typeof siteBlocDocumentSchema> {
    return {
        ...projectIdentity(definition),
        draftJson: serialize(definition.draft),
        publishedJson: definition.published ? serialize(definition.published) : null,
    };
}

function serialize(snapshot: SiteBlocSnapshot): string {
    const source = JSON.stringify(snapshot);
    checkSnapshotBytes(source);
    return source;
}

function parseSiteBlocDocument(source: string): SiteBlocSnapshot {
    checkSnapshotBytes(source);
    let parsed: SiteBlocSnapshot;
    try {
        parsed = JSON.parse(source);
    } catch {
        throw new ContentValidationError("draftJson", "valid JSON is required");
    }
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
        throw new ContentValidationError("draftJson", "a snapshot object is required");
    }
    const fields = new Set(["name", "group", "description", "structure", "slots", "defaultContent", "dependencies"]);
    if (Object.keys(parsed).some((field) => !fields.has(field))) {
        throw new ContentValidationError("draftJson", "unknown snapshot field");
    }
    return parsed;
}
