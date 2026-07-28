import {
    identifyCompatibilityReportV2,
    identifyStatefulChangeSelection,
    type CompatibilityReportV2,
    type StatefulChangeSelectionV1,
} from "@bernouy/cms-integration-verification";
import type { IntegrationRegistryCandidatePlanningArtifacts } from "cms-integration-registry/interfaces/publication";
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

export async function persistCandidatePlanningArtifacts(
    layout: FsIntegrationRegistryCandidateLayout,
    input: IntegrationRegistryCandidatePlanningArtifacts,
) {
    const compatibility = await identifyCompatibilityReportV2(input.compatibilityReport);
    const stateful = await identifyStatefulChangeSelection(input.statefulChanges);
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
    return Object.freeze({
        compatibilityReportDigest: compatibility.digest,
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
