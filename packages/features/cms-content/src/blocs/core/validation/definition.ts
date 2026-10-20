import { isBlocOwnership, normalizeBlocWrite } from "cms-content/blocs/core/catalogue/records";
import { ContentValidationError } from "cms-content/application/core/validation/errors";
import { validateSiteBlocSnapshot } from "cms-content/blocs/core/validation/snapshot";
import { isValidCustomElementTag } from "cms-content/application/core/validation/predicates";
import { isPlatformManagedNativeElementTag } from "cms-content/blocs/core/validation/nativeHtml";
import { parsePresentationImage } from "cms-content/blocs/core/presentationImage";
import { validateBlocContentMarkup } from "cms-content/blocs/core/markup/validation/nativeContent";
import { assertBlocArtifactBudgets } from "cms-content/blocs/core/markup/validation/documents/blocBudgets";
import { blocSettingAttributeNameIssue } from "cms-content/blocs/core/markup/validation/contracts/nativeAttributes";
import type { BlocOwnership, SiteBlocDefinition, TBloc, TBlocWrite } from "cms-content/blocs/interfaces/blocs";

const BLOC_WRITE_KEYS = new Set<keyof TBlocWrite>([
    "id",
    "kind",
    "name",
    "group",
    "catalogueOrder",
    "description",
    "thumbnail",
    "catalogue",
    "uses",
    "root",
    "styleCSS",
    "styleCollectionId",
    "viewJS",
    "markupHTML",
    "defaultContent",
    "slots",
    "settings",
    "ownership",
    "source",
]);

export function validateBlocWrite(value: TBlocWrite): TBloc {
    if (!isRecord(value)) {
        throw new ContentValidationError("bloc", "object expected");
    }
    if ("content" in value) {
        throw new ContentValidationError("bloc", "content is not a Bloc contract; declare the default slot instead");
    }
    const unknownKey = Object.keys(value).find((key) => !BLOC_WRITE_KEYS.has(key as keyof TBlocWrite));
    if (unknownKey !== undefined) {
        throw new ContentValidationError("bloc", `unknown field ${unknownKey}`);
    }
    if (value.ownership !== undefined) {
        validateOwnership(value.ownership);
    }
    const bloc = normalizeBlocWrite(value);
    assertBlocArtifactBudgets(bloc.viewJS, bloc.source, bloc.styleCSS);
    validateBlocRuntime(bloc.viewJS);
    if (bloc.thumbnail !== undefined) {
        bloc.thumbnail = parsePresentationImage(bloc.thumbnail);
    }
    if (bloc.catalogue !== undefined && bloc.catalogue !== "listed" && bloc.catalogue !== "hidden") {
        throw new ContentValidationError("catalogue", "expected listed or hidden");
    }
    if (!isValidCustomElementTag(bloc.id)) {
        throw new ContentValidationError("id", "valid lower-case namespaced Bloc identifier expected");
    }
    if (bloc.kind !== "component" && bloc.kind !== "composition") {
        throw new ContentValidationError("kind", "component or composition expected");
    }
    if (typeof bloc.markupHTML !== "string" || !bloc.markupHTML.trim()) {
        throw new ContentValidationError("markupHTML", "non-empty HTML expected");
    }
    if ((bloc.styleCSS === undefined) !== (bloc.styleCollectionId === undefined)) {
        throw new ContentValidationError("styleCSS", "styleCSS and styleCollectionId must be supplied together");
    }
    if (bloc.styleCSS !== undefined && !bloc.styleCSS.trim()) {
        throw new ContentValidationError("styleCSS", "non-empty scoped CSS expected");
    }
    if (bloc.styleCollectionId !== undefined && !/^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/u.test(bloc.styleCollectionId)) {
        throw new ContentValidationError("styleCollectionId", "valid lower-case collection identifier expected");
    }
    if (bloc.kind === "composition" && bloc.styleCSS !== undefined) {
        throw new ContentValidationError("bloc", "styleCSS is forbidden for compositions");
    }
    if (bloc.kind === "composition" && bloc.viewJS.trim()) {
        throw new ContentValidationError("bloc", "viewJS is forbidden for compositions");
    }
    validateManagedNativeElement(bloc.root, "root");
    for (const setting of bloc.settings ?? []) {
        const issue = blocSettingAttributeNameIssue(setting.id, bloc.root.accepts);
        if (issue) {
            throw new ContentValidationError("settings", issue);
        }
    }
    bloc.markupHTML = validateBlocContentMarkup(bloc.markupHTML, {
        field: "markupHTML",
        kind: "fixed",
        ownerTag: bloc.id,
    }).html;
    if (bloc.defaultContent !== undefined) {
        bloc.defaultContent = validateBlocContentMarkup(bloc.defaultContent, {
            field: "defaultContent",
            kind: "default",
            ownerTag: bloc.id,
        }).html;
    }
    return bloc;
}

function validateBlocRuntime(source: string): void {
    if (/(?:\bwindow\s*\.\s*)?\bcustomElements\s*\.\s*define\s*\(/u.test(source)) {
        throw new ContentValidationError(
            "viewJS",
            "customElements.define is forbidden; Bloc behavior must mount on the native cms-bloc root",
        );
    }
    if (/\battachShadow\s*\(|\.\s*shadowRoot\b/u.test(source)) {
        throw new ContentValidationError("viewJS", "Shadow DOM APIs are forbidden in Bloc behavior runtimes");
    }
}

function validateManagedNativeElement(value: TBloc["root"], field: "root"): void {
    if (value === undefined) {
        throw new ContentValidationError(field, "a native element contract is required");
    }
    if (
        value === null ||
        typeof value !== "object" ||
        Array.isArray(value) ||
        Object.keys(value).some((key) => key !== "accepts" && key !== "attributes" && key !== "defaults") ||
        !Array.isArray(value.accepts) ||
        value.accepts.length === 0 ||
        new Set(value.accepts).size !== value.accepts.length
    ) {
        throw new ContentValidationError(field, "non-empty unique accepts list expected");
    }
    for (const tag of value.accepts) {
        if (!isPlatformManagedNativeElementTag(tag)) {
            throw new ContentValidationError(field, `unsupported managed native element tag ${tag}`);
        }
        if (tag !== tag.toLowerCase()) {
            throw new ContentValidationError(field, "lower-case native element tags expected");
        }
    }
    if (value.attributes !== undefined) {
        if (
            value.attributes === null ||
            typeof value.attributes !== "object" ||
            Array.isArray(value.attributes) ||
            Object.keys(value.attributes).length === 0
        ) {
            throw new ContentValidationError(field, "non-empty native attribute constraints expected");
        }
        for (const [name, constraint] of Object.entries(value.attributes)) {
            if (!/^[a-z][a-z0-9-]*$/u.test(name) || constraint === null || typeof constraint !== "object") {
                throw new ContentValidationError(field, "valid native attribute constraints expected");
            }
            if (
                Object.keys(constraint).some((key) => key !== "required" && key !== "values") ||
                (constraint.required !== undefined && typeof constraint.required !== "boolean") ||
                (constraint.values !== undefined &&
                    (!Array.isArray(constraint.values) ||
                        constraint.values.length === 0 ||
                        new Set(constraint.values).size !== constraint.values.length ||
                        constraint.values.some((entry) => typeof entry !== "string"))) ||
                (constraint.required === undefined && constraint.values === undefined)
            ) {
                throw new ContentValidationError(field, "valid native attribute constraints expected");
            }
        }
    }
    if (
        value.defaults !== undefined &&
        (value.defaults === null ||
            typeof value.defaults !== "object" ||
            Array.isArray(value.defaults) ||
            Object.values(value.defaults).some((entry) => typeof entry !== "string"))
    ) {
        throw new ContentValidationError(field, "native defaults must be string attributes");
    }
}

export function validateSiteBlocDefinition(value: SiteBlocDefinition): SiteBlocDefinition {
    if (!isRecord(value)) {
        throw new ContentValidationError("definition", "object expected");
    }
    if (value.groupId !== undefined && (typeof value.groupId !== "string" || !value.groupId.trim())) {
        throw new ContentValidationError("groupId", "non-empty group identifier expected");
    }
    if (value.schema !== "cms.site-bloc.v1") {
        throw new ContentValidationError("schema", 'expected "cms.site-bloc.v1"');
    }
    if (typeof value.id !== "string" || !value.id.trim()) {
        throw new ContentValidationError("id", "required");
    }
    if (typeof value.tag !== "string" || !value.tag.startsWith("site-") || !isValidCustomElementTag(value.tag)) {
        throw new ContentValidationError("tag", 'expected a valid namespaced Bloc identifier starting with "site-"');
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
            'expected "code-managed" or "site-builder" ownership with all required fields',
        );
    }
}

function validDate(value: Date): boolean {
    return value instanceof Date && !Number.isNaN(value.getTime());
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return !!value && typeof value === "object" && !Array.isArray(value);
}
