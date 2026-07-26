import type { IntegrationDefinition } from "@bernouy/cms-integrations";
import { identifyReviewedSchemaBaseline } from "@bernouy/cms-integration-verification";
import { ReviewedSchemaBaselineImportError } from "../../../../../../core/baselines/errors";
import type { IntegrationRegistryCatalogSnapshot } from "../../../../../../interfaces/catalog";
import type { OfficialRepositoryBootstrapBaselineApproval } from "../../../../../../interfaces/publication";
import type {
    ReviewedSchemaBaselineHistory,
    ReviewedSchemaBaselineImportRequest,
} from "../../../../../../interfaces/reportStore";
import { assertApprovedReviewedSchemaBaseline } from "../../../publication/official-bootstrap/approval";
import type { ReviewedSchemaBaselineImportTarget } from "../types";
import { validateReviewedSchemaBaselineDependencies } from "./dependencies";
export { identifyReviewedSchemaBaselineImportPolicy } from "./policy";

export async function validateReviewedSchemaBaselineImport(
    request: ReviewedSchemaBaselineImportRequest,
    snapshot: IntegrationRegistryCatalogSnapshot,
    approval: OfficialRepositoryBootstrapBaselineApproval,
    targets: readonly ReviewedSchemaBaselineImportTarget[],
): Promise<void> {
    const { baseline } = request;
    const location = snapshot.locateExactVersion(baseline.kind, baseline.version);
    if (!location || location.package.digest !== baseline.packageDigest) {
        throw new ReviewedSchemaBaselineImportError(
            404,
            "reviewed_schema_baseline_import_not_found",
            "Reviewed schema baseline package identity is not present in the live registry",
        );
    }
    const approvedTarget = targets.find(
        (target) =>
            target.kind === baseline.kind &&
            target.version === baseline.version &&
            target.packageDigest === baseline.packageDigest &&
            target.connectorKey === baseline.connectorKey &&
            target.lineageId === baseline.lineageId,
    );
    if (!approvedTarget) {
        throw unapproved("Reviewed schema baseline connector identity is not approved");
    }
    try {
        assertApprovedReviewedSchemaBaseline(
            baseline,
            { version: location.version, packageDigest: location.package.digest },
            approval,
        );
    } catch (error) {
        throw unapproved("Reviewed schema baseline provenance is not approved", error);
    }
    validateConnector(baseline, location.definitionSnapshot);
    validateReviewedSchemaBaselineDependencies(baseline.dependencies, location.definitionSnapshot, snapshot);
}

export async function exactBaselineAlreadyStored(
    history: ReviewedSchemaBaselineHistory | null,
    request: ReviewedSchemaBaselineImportRequest,
): Promise<boolean> {
    const existing = history?.revisions.find(({ reportId }) => reportId === request.baseline.reportId);
    return existing ? (await identifyReviewedSchemaBaseline(existing)).digest === request.baselineDigest : false;
}

export function assertReviewedSchemaBaselineImportCas(
    history: ReviewedSchemaBaselineHistory | null,
    request: ReviewedSchemaBaselineImportRequest,
): void {
    if (
        (request.baseline.revisionType === "root" && request.expectedCurrent !== null) ||
        (request.baseline.revisionType === "revision" &&
            (!request.expectedCurrent || request.baseline.supersedes !== request.expectedCurrent.revisionId))
    ) {
        throw unapproved("Reviewed schema baseline revision shape does not match its exact current precondition");
    }
    const actual = history
        ? { revisionId: history.currentRevisionId, baselineDigest: history.currentBaselineDigest }
        : null;
    if (
        request.expectedCurrent?.revisionId !== actual?.revisionId ||
        request.expectedCurrent?.baselineDigest !== actual?.baselineDigest
    ) {
        throw new ReviewedSchemaBaselineImportError(
            409,
            "reviewed_schema_baseline_import_conflict",
            "Reviewed schema baseline current revision does not match the import precondition",
        );
    }
}

function validateConnector(
    baseline: ReviewedSchemaBaselineImportRequest["baseline"],
    definition: IntegrationDefinition,
): void {
    const connectors = (definition.connectors ?? []).filter(({ schemas }) => (schemas?.length ?? 0) > 0);
    if (
        connectors.length !== 1 ||
        connectors[0]!.provider !== baseline.legacySelector.provider ||
        connectors[0]!.root !== baseline.legacySelector.root
    ) {
        throw unapproved("Reviewed schema baseline selector does not match the package SQL connector");
    }
}

function unapproved(message: string, cause?: unknown): ReviewedSchemaBaselineImportError {
    return new ReviewedSchemaBaselineImportError(
        422,
        "reviewed_schema_baseline_import_unapproved",
        message,
        cause === undefined ? undefined : { cause },
    );
}
