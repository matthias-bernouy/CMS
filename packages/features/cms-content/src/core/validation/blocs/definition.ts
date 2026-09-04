import { isBlocOwnership, normalizeBlocWrite } from "cms-content/core/blocs/records";
import { ContentValidationError } from "cms-content/core/validation/errors";
import { validateSiteBlocSnapshot } from "cms-content/core/validation/blocs/snapshot";
import { isValidCustomElementTag } from "cms-content/core/validation/predicates";
import type { BlocOwnership, SiteBlocDefinition, TBloc, TBlocWrite } from "cms-content/interfaces/blocs";

export function validateBlocWrite(value: TBlocWrite): TBloc {
    if (!isRecord(value)) {
        throw new ContentValidationError("bloc", "object expected");
    }
    if (value.ownership !== undefined) {
        validateOwnership(value.ownership);
    }
    const bloc = normalizeBlocWrite(value);
    if (bloc.catalogue !== undefined && bloc.catalogue !== "active" && bloc.catalogue !== "inactive") {
        throw new ContentValidationError("catalogue", "expected active or inactive");
    }
    if (!isRegisteredBlocTag(bloc.id)) {
        throw new ContentValidationError("id", "valid lower-case HTML or custom-element tag expected");
    }
    if (bloc.compositionHTML !== undefined && !bloc.compositionHTML.trim()) {
        throw new ContentValidationError("compositionHTML", "non-empty HTML expected");
    }
    if (bloc.compositionHTML !== undefined && bloc.viewJS.trim()) {
        throw new ContentValidationError("bloc", "viewJS and compositionHTML are mutually exclusive");
    }
    if (bloc.internal && (bloc.compositionHTML !== undefined || !bloc.viewJS.trim())) {
        throw new ContentValidationError("internal", "internal blocs must provide a component view");
    }
    return bloc;
}

export function validateSiteBlocDefinition(value: SiteBlocDefinition): SiteBlocDefinition {
    if (!isRecord(value)) {
        throw new ContentValidationError("definition", "object expected");
    }
    if (value.schema !== "cms.site-bloc.v1") {
        throw new ContentValidationError("schema", 'expected "cms.site-bloc.v1"');
    }
    if (typeof value.id !== "string" || !value.id.trim()) {
        throw new ContentValidationError("id", "required");
    }
    if (typeof value.tag !== "string" || !value.tag.startsWith("site-") || !isValidCustomElementTag(value.tag)) {
        throw new ContentValidationError("tag", 'expected a valid custom-element tag starting with "site-"');
    }
    if (
        !isRecord(value.ownership) ||
        value.ownership.kind !== "site-builder" ||
        value.ownership.definitionId !== value.id
    ) {
        throw new ContentValidationError("ownership", "site-builder definitionId must match the definition id");
    }
    if (!Number.isInteger(value.draftRevision) || value.draftRevision < 1) {
        throw new ContentValidationError("draftRevision", "positive integer expected");
    }
    if (
        value.publishedRevision !== null &&
        (!Number.isInteger(value.publishedRevision) ||
            value.publishedRevision < 1 ||
            value.publishedRevision > value.draftRevision)
    ) {
        throw new ContentValidationError("publishedRevision", "published revision must exist in the draft history");
    }
    if ((value.published === null) !== (value.publishedRevision === null)) {
        throw new ContentValidationError("published", "snapshot and publishedRevision must both be present or absent");
    }
    if (value.lifecycle !== "active" && value.lifecycle !== "archived") {
        throw new ContentValidationError("lifecycle", 'expected "active" or "archived"');
    }
    if (
        !validDate(value.createdAt) ||
        !validDate(value.updatedAt) ||
        (value.archivedAt && !validDate(value.archivedAt))
    ) {
        throw new ContentValidationError("timestamps", "valid Date values expected");
    }
    if (value.updatedAt < value.createdAt) {
        throw new ContentValidationError("updatedAt", "cannot precede createdAt");
    }
    if (value.lifecycle === "active" && value.archivedAt) {
        throw new ContentValidationError("archivedAt", "active definitions cannot carry an archive timestamp");
    }
    if (value.lifecycle === "archived" && !value.archivedAt) {
        throw new ContentValidationError("archivedAt", "archived definitions require an archive timestamp");
    }

    return {
        ...structuredClone(value),
        draft: validateSiteBlocSnapshot(value.draft, value.tag),
        published: value.published ? validateSiteBlocSnapshot(value.published, value.tag) : null,
    };
}

function validateOwnership(value: unknown): asserts value is BlocOwnership {
    if (!isBlocOwnership(value)) {
        throw new ContentValidationError(
            "ownership",
            'expected "code-managed", "site-builder" or "integration" ownership with all required fields',
        );
    }
}

function validDate(value: Date): boolean {
    return value instanceof Date && !Number.isNaN(value.getTime());
}

function isRegisteredBlocTag(value: string): boolean {
    return typeof value === "string" && /^[a-z][a-z0-9-]*$/.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === "object" && !Array.isArray(value);
}
