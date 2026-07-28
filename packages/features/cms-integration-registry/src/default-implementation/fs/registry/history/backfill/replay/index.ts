import { canonicalJsonBytes } from "@bernouy/cms-integration-packages";
import { identifyIntegrationVerificationBackfillRequest } from "../../../../../../core/publication/backfill";
import type { IntegrationVerificationBackfillResult } from "../../../../../../interfaces/publication";
import { removeFileIfExists } from "../../../persistence/canonicalFile";
import type { FsIntegrationVerificationBackfillJournal } from "../document";
import type { FsIntegrationVerificationBackfillerConfig } from "../types";
import { activateIntegrationVerificationBackfill } from "./activation";
import { advanceIntegrationVerificationBackfill, notifyIntegrationVerificationBackfillBoundary } from "./phases";
import { inspectIntegrationVerificationBackfillState, validateIntegrationVerificationBackfill } from "../validation";

export async function replayIntegrationVerificationBackfill(
    config: FsIntegrationVerificationBackfillerConfig,
    path: string,
    initial: FsIntegrationVerificationBackfillJournal,
): Promise<IntegrationVerificationBackfillResult> {
    const identified = await identifyIntegrationVerificationBackfillRequest(initial.request);
    if (identified.digest !== initial.requestDigest) {
        throw new Error("Integration verification backfill request changed after journalling");
    }
    await validateIntegrationVerificationBackfill(config, identified);
    let journal = initial;
    await config.bundles.put({
        envelope: identified.request.verification.envelope,
        canonicalBytes: canonicalJsonBytes(identified.request.verification.envelope),
        digest: identified.request.verification.digest,
    });
    journal = await advanceIntegrationVerificationBackfill(config, path, journal, "bundle-written");
    await config.compatibilityReports.append({ report: identified.request.compatibilityReport, expectedCurrent: null });
    journal = await advanceIntegrationVerificationBackfill(config, path, journal, "compatibility-written");
    await config.verificationReports.append({ report: identified.request.verificationReport, expectedCurrent: null });
    journal = await advanceIntegrationVerificationBackfill(config, path, journal, "verification-written");
    await config.decisions.append({ report: identified.request.decision, expectedCurrent: null });
    journal = await advanceIntegrationVerificationBackfill(config, path, journal, "decision-written");
    journal = await config.mutations.runExclusive(identified.request.decision.kind, async () => {
        return await activateIntegrationVerificationBackfill(
            config,
            path,
            journal,
            identified.request.verification.digest,
        );
    });
    const state = await inspectIntegrationVerificationBackfillState(config, identified);
    if (Object.values(state).some((value) => value !== "exact")) {
        throw new Error("Integration verification backfill did not persist its exact complete state");
    }
    await removeFileIfExists(path);
    return integrationVerificationBackfillResult(journal, identified.decisionDigest, "backfilled");
}

export function integrationVerificationBackfillResult(
    journal: FsIntegrationVerificationBackfillJournal,
    decisionDigest: string,
    outcome: "backfilled" | "unchanged",
): IntegrationVerificationBackfillResult {
    const target = journal.request.verification.envelope.target;
    return {
        operationId: journal.operationId,
        outcome,
        kind: target.kind,
        version: target.version,
        packageDigest: target.packageDigest,
        verificationDigest: journal.request.verification.digest,
        decisionRevisionId: journal.request.decision.decisionId,
        decisionDigest,
    };
}

export { notifyIntegrationVerificationBackfillBoundary as notifyBoundary };
