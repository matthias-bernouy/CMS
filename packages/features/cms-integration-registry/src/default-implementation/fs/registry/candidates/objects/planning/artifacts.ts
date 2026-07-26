import {
    identifyCompatibilityReportV2,
    identifyStatefulChangeSelection,
    type CompatibilityReportV2,
    type StatefulChangeSelectionV1,
} from "@bernouy/cms-integration-verification";
import type { IntegrationRegistryCandidateRecord } from "cms-integration-registry/interfaces/publication";
import { readCanonicalJsonFile } from "../../../persistence/canonicalFile";
import { readVerifiedRegistryDirectory } from "../../../persistence/ownedDirectory";
import {
    assertSha256Digest,
    candidateCompatibilityReportPath,
    candidateStatefulSelectionPath,
    FS_INTEGRATION_REGISTRY_CANDIDATE_CONTROL_DOCUMENT_LIMIT,
    type FsIntegrationRegistryCandidateLayout,
} from "../../layout";
import { corrupt, writeOrVerifyObject } from "../shared";
import { CANDIDATE_PLAN_BINDING_SCHEMA, writeOrVerifyCandidatePlanBinding } from "./binding";

export async function persistCandidatePlanningArtifacts(
    layout: FsIntegrationRegistryCandidateLayout,
    record: IntegrationRegistryCandidateRecord,
    input: Readonly<{
        expectedRevision: number;
        compatibilityReport: CompatibilityReportV2;
        compatibilityEvaluatorInputDigest: string;
        statefulChanges: StatefulChangeSelectionV1;
    }>,
) {
    const compatibility = await identifyCompatibilityReportV2(input.compatibilityReport);
    const stateful = await identifyStatefulChangeSelection(input.statefulChanges);
    assertPlanningBindings(record, compatibility.report, compatibility.digest, stateful.selection);
    assertSha256Digest(input.compatibilityEvaluatorInputDigest);
    await writeOrVerifyObject(
        layout,
        layout.compatibilityReports,
        candidateCompatibilityReportPath(layout, compatibility.digest),
        compatibility.report,
        FS_INTEGRATION_REGISTRY_CANDIDATE_CONTROL_DOCUMENT_LIMIT,
        () => readCandidateCompatibilityReport(layout, compatibility.digest),
    );
    await writeOrVerifyObject(
        layout,
        layout.statefulSelections,
        candidateStatefulSelectionPath(layout, stateful.digest),
        stateful.selection,
        FS_INTEGRATION_REGISTRY_CANDIDATE_CONTROL_DOCUMENT_LIMIT,
        () => readCandidateStatefulSelection(layout, stateful.digest),
    );
    return await writeOrVerifyCandidatePlanBinding(layout, {
        schema: CANDIDATE_PLAN_BINDING_SCHEMA,
        candidateId: record.candidateId,
        expectedRevision: input.expectedRevision,
        candidateDigest: record.candidateDigest,
        compatibilityReportDigest: compatibility.digest,
        compatibilityEvaluatorInputDigest: input.compatibilityEvaluatorInputDigest,
        statefulChangeSelectionDigest: stateful.digest,
    });
}

export async function readCandidateCompatibilityReport(
    layout: FsIntegrationRegistryCandidateLayout,
    digest: string,
): Promise<CompatibilityReportV2> {
    return await readIdentifiedObject(
        layout.compatibilityReports,
        candidateCompatibilityReportPath(layout, digest),
        digest,
        identifyCompatibilityReportV2,
        "report",
    );
}

export async function readCandidateStatefulSelection(
    layout: FsIntegrationRegistryCandidateLayout,
    digest: string,
): Promise<StatefulChangeSelectionV1> {
    return await readIdentifiedObject(
        layout.statefulSelections,
        candidateStatefulSelectionPath(layout, digest),
        digest,
        identifyStatefulChangeSelection,
        "selection",
    );
}

async function readIdentifiedObject<T>(
    root: string,
    path: string,
    digest: string,
    identify: (value: unknown) => Promise<Readonly<{ digest: string; report?: T; selection?: T }>>,
    field: "report" | "selection",
): Promise<T> {
    assertSha256Digest(digest);
    await readVerifiedRegistryDirectory(root);
    const value = await readCanonicalJsonFile(path, FS_INTEGRATION_REGISTRY_CANDIDATE_CONTROL_DOCUMENT_LIMIT);
    if (value === null) {
        corrupt(`Candidate planning object ${digest} is missing`);
    }
    const identified = await identify(value);
    const parsed = identified[field];
    if (identified.digest !== digest || !parsed) {
        corrupt(`Candidate planning object ${digest} does not match its path digest`);
    }
    await readVerifiedRegistryDirectory(root);
    return parsed;
}

function assertPlanningBindings(
    record: IntegrationRegistryCandidateRecord,
    report: CompatibilityReportV2,
    reportDigest: string,
    selection: StatefulChangeSelectionV1,
): void {
    if (
        report.kind !== record.kind ||
        report.version !== record.version ||
        report.packageDigest !== record.packageDigest ||
        selection.target.kind !== record.kind ||
        selection.target.version !== record.version ||
        selection.target.packageDigest !== record.packageDigest ||
        selection.compatibilityReport.revisionId !== report.reportId ||
        selection.compatibilityReport.reportDigest !== reportDigest
    ) {
        corrupt(`Candidate ${record.candidateId} planning artifacts do not bind its exact identity`);
    }
}
