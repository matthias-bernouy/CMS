import { extractRefs } from "content/blocs/core/markup/contentRefs";
import type { z } from "zod";
import type { siteBlocConsumerSchema } from "content/application/schemas/site";
import type { BlocRecord, SiteBlocDefinition } from "content/blocs/interfaces/blocs";
import {
    BlocRevisionConflictError,
    ContentConflictError,
    ContentValidationError,
    SiteBlocNotFoundError,
} from "content/application/core/validation/errors";

export type SiteBlocConsumer = z.output<typeof siteBlocConsumerSchema>;
export const SITE_BLOC_REFERENCE_LIMIT = 16;

export class SiteBlocReferencedError extends ContentConflictError {
    readonly references: readonly SiteBlocConsumer[];
    readonly truncated: boolean;
    constructor(references: readonly SiteBlocConsumer[]) {
        super("The composition is still referenced. Remove its consumers before deleting it.");
        this.name = "SiteBlocReferencedError";
        this.references = structuredClone(references.slice(0, SITE_BLOC_REFERENCE_LIMIT));
        this.truncated = references.length > SITE_BLOC_REFERENCE_LIMIT;
    }
}

export class SiteBlocReferenceCheckError extends ContentConflictError {
    constructor() {
        super("Reference analysis could not complete. No composition was deleted.");
        this.name = "SiteBlocReferenceCheckError";
        this.status = 503;
    }
}

export class SiteBlocIdentityConflictError extends ContentConflictError {
    constructor() {
        super("The composition identity changed. Read the current resource before retrying.");
        this.name = "SiteBlocIdentityConflictError";
    }
}

export function assertSiteBlocIdentity(record: BlocRecord, identity: string): void {
    if (
        !identity ||
        record.siteDefinition?.id !== identity ||
        record.ownership.kind !== "site-builder" ||
        record.ownership.definitionId !== identity
    ) {
        throw new SiteBlocIdentityConflictError();
    }
}

export function requireSiteBlocDeletion(
    record: BlocRecord | null,
    tag: string,
    revision: number,
    identity: string,
): SiteBlocDefinition {
    if (!Number.isSafeInteger(revision) || revision < 1) {
        throw new ContentValidationError("revision", "a positive safe integer is required");
    }
    if (!record) {
        throw new SiteBlocNotFoundError(tag);
    }
    if (record.ownership.kind !== "site-builder" || !record.siteDefinition || record.contributionId) {
        throw new ContentValidationError("tag", "only site-owned compositions can be deleted");
    }
    if (record.siteDefinition.draftRevision !== revision) {
        throw new BlocRevisionConflictError(tag, revision, record.siteDefinition.draftRevision);
    }
    assertSiteBlocIdentity(record, identity);
    return record.siteDefinition;
}

export function blocReferencesTag(record: BlocRecord, tag: string): boolean {
    return blocReferenceTags(record).includes(tag);
}

/** One canonical projection for memory checks and indexed Mongo reverse lookups. */
export function blocReferenceTags(record: BlocRecord): string[] {
    const tags = new Set([
        ...(record.artifact?.uses ?? []),
        ...(record.siteDefinition?.draft.dependencies ?? []),
        ...(record.siteDefinition?.published?.dependencies ?? []),
    ]);
    for (const html of [
        record.artifact?.markupHTML,
        record.artifact?.defaultContent,
        record.artifact?.initialDocument?.html,
        record.siteDefinition?.draft.defaultContent,
        record.siteDefinition?.published?.defaultContent,
    ]) {
        if (html !== undefined) {
            for (const tag of extractRefs(html).blocs) {
                tags.add(tag);
            }
        }
    }
    return [...tags].sort();
}
