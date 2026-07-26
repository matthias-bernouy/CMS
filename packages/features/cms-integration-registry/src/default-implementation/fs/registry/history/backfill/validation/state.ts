import {
    identifyCompatibilityReportV2,
    identifyReleaseAdmissionDecision,
    identifyVerificationReport,
} from "@bernouy/cms-integration-verification";
import { IntegrationVerificationBackfillError } from "../../../../../../core/publication/backfill";
import type { IdentifiedIntegrationVerificationBackfillRequest } from "../../../../../../interfaces/publication";
import type { ReleaseReportHistory } from "../../../../../../interfaces/reportStore";
import type { FsIntegrationVerificationBackfillerConfig } from "../types";

type Presence = "absent" | "exact" | "conflict";

export type IntegrationVerificationBackfillState = Readonly<{
    bundle: Presence;
    compatibility: Presence;
    verification: Presence;
    decision: Presence;
    index: Presence;
}>;

export async function inspectIntegrationVerificationBackfillState(
    config: FsIntegrationVerificationBackfillerConfig,
    identified: IdentifiedIntegrationVerificationBackfillRequest,
): Promise<IntegrationVerificationBackfillState> {
    const { request } = identified;
    const { kind, version } = request.verification.envelope.target;
    const [bundle, compatibility, verification, decision] = await Promise.all([
        config.bundles.get(request.verification.digest),
        config.compatibilityReports.get(kind, version),
        config.verificationReports.get(kind, version),
        config.decisions.getHistory(kind, version),
    ]);
    const entry = config.snapshots
        .current()
        .getIndex(kind)
        ?.versions.find((item) => item.version === version);
    return {
        bundle: bundle ? "exact" : "absent",
        compatibility: await reportPresence(
            compatibility,
            request.compatibilityReport.reportId,
            identified.compatibilityReportDigest,
            identifyCompatibilityReportV2,
        ),
        verification: await reportPresence(
            verification,
            request.verificationReport.reportId,
            identified.verificationReportDigest,
            identifyVerificationReport,
        ),
        decision: await reportPresence(
            decision,
            request.decision.decisionId,
            identified.decisionDigest,
            identifyReleaseAdmissionDecision,
        ),
        index: !entry?.verificationDigest
            ? "absent"
            : entry.verificationDigest === request.verification.digest
              ? "exact"
              : "conflict",
    };
}

export function assertInitialIntegrationVerificationBackfillState(
    state: IntegrationVerificationBackfillState,
): "pending" | "unchanged" {
    const values = [state.bundle, state.compatibility, state.verification, state.decision, state.index] as const;
    if (values.every((value) => value === "exact")) {
        return "unchanged";
    }
    if (values.some((value) => value === "conflict")) {
        throw new IntegrationVerificationBackfillError(
            409,
            "verification_backfill_conflict",
            "Integration verification backfill conflicts with existing immutable evidence",
        );
    }
    const firstAbsent = values.indexOf("absent");
    if (firstAbsent >= 0 && values.slice(firstAbsent).every((value) => value === "absent")) {
        return "pending";
    }
    throw new IntegrationVerificationBackfillError(
        409,
        "verification_backfill_partial",
        "Integration verification backfill found partial state without its durable journal",
    );
}

async function reportPresence<T>(
    history: ReleaseReportHistory<T> | null,
    revisionId: string,
    digest: string,
    identify: (value: unknown) => Promise<Readonly<{ digest: string }>>,
): Promise<Presence> {
    if (!history) {
        return "absent";
    }
    const revision = history.revisions.find((entry) => revisionIdentifier(entry) === revisionId);
    return revision && (await identify(revision)).digest === digest ? "exact" : "conflict";
}

function revisionIdentifier(value: unknown): string | undefined {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return undefined;
    }
    const record = value as Record<string, unknown>;
    return typeof record.reportId === "string"
        ? record.reportId
        : typeof record.decisionId === "string"
          ? record.decisionId
          : undefined;
}
