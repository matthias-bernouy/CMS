import { randomUUID } from "node:crypto";
import { identifyReleaseAdmissionDecision } from "@bernouy/cms-integration-verification";
import {
    IntegrationRegistryVersionEligibilityConflictError,
    IntegrationRegistryVersionEligibilityIneligibleError,
    IntegrationRegistryVersionEligibilityNotFoundError,
    IntegrationRegistryVersionEligibilityStaleDecisionError,
} from "../../../../../core/promotion/eligibilityErrors";
import {
    validateVersionBlockRequest,
    validateVersionInadmissibleRequest,
} from "../../../../../core/promotion/eligibilityRequest";
import type {
    IntegrationRegistryVersionBlockRequest,
    IntegrationRegistryVersionEligibilityManager,
    IntegrationRegistryVersionEligibilityRecord,
    IntegrationRegistryVersionInadmissibleRequest,
} from "../../../../../interfaces/promotion";
import { ensureFsIntegrationRegistryLayout } from "../../persistence/layout";
import { nextVersionEligibilityIndex } from "./channels";
import { parseVersionEligibilityRecord } from "./document";
import { ensureVersionEligibilityPaths } from "./layout";
import { commitFsIntegrationRegistryVersionEligibility } from "./transaction";
import type { FsIntegrationRegistryVersionEligibilityManagerConfig } from "./types";

export class FsIntegrationRegistryVersionEligibilityManager implements IntegrationRegistryVersionEligibilityManager {
    constructor(private readonly config: FsIntegrationRegistryVersionEligibilityManagerConfig) {}

    async blockVersion(request: IntegrationRegistryVersionBlockRequest) {
        const validated = validateVersionBlockRequest(request);
        return await this.mutate("block", validated);
    }

    async markVersionInadmissible(request: IntegrationRegistryVersionInadmissibleRequest) {
        const validated = validateVersionInadmissibleRequest(request);
        return await this.mutate("mark-inadmissible", validated);
    }

    private async mutate(
        action: "block" | "mark-inadmissible",
        request: IntegrationRegistryVersionBlockRequest | IntegrationRegistryVersionInadmissibleRequest,
    ) {
        const operationId = this.config.createOperationId?.() ?? randomUUID();
        const recordId = this.config.createRecordId?.() ?? randomUUID();
        return await this.config.mutations.runExclusive(request.kind, async () => {
            const snapshot = this.config.snapshots.current();
            const index = snapshot.getIndex(request.kind);
            const location = snapshot.locateExactVersion(request.kind, request.version);
            if (!index || !location) {
                throw new IntegrationRegistryVersionEligibilityNotFoundError(request.kind, request.version);
            }
            const entry = index.versions.find((candidate) => candidate.version === request.version);
            if (!entry) {
                throw new IntegrationRegistryVersionEligibilityNotFoundError(request.kind, request.version);
            }
            assertStatusTransition(action, request.kind, request.version, entry.status);
            const history = await this.config.decisions.get(request.kind, request.version);
            if (!history) {
                throw new IntegrationRegistryVersionEligibilityNotFoundError(request.kind, request.version);
            }
            const identified = await identifyReleaseAdmissionDecision(history.current);
            if (
                history.currentRevisionId !== request.currentDecision.revisionId ||
                history.currentReportDigest !== request.currentDecision.digest ||
                identified.digest !== history.currentReportDigest
            ) {
                throw new IntegrationRegistryVersionEligibilityStaleDecisionError();
            }
            const decision = history.current;
            if (
                decision.decisionId !== history.currentRevisionId ||
                decision.kind !== request.kind ||
                decision.version !== request.version ||
                decision.packageDigest !== location.package.digest
            ) {
                throw new IntegrationRegistryVersionEligibilityStaleDecisionError();
            }
            if (action === "mark-inadmissible" && decision.admissible) {
                throw new IntegrationRegistryVersionEligibilityIneligibleError(
                    "An admissible composite release decision cannot mark a version inadmissible",
                );
            }
            const nextStatus = action === "block" ? "blocked" : "inadmissible";
            const nextIndex = nextVersionEligibilityIndex(index, request.version, nextStatus);
            const createdAt = this.config.now?.() ?? new Date().toISOString();
            const record = parseVersionEligibilityRecord({
                schema: "cms.integration.registry.version-eligibility.v1",
                id: recordId,
                operationId,
                action,
                kind: request.kind,
                version: request.version,
                packageDigest: location.package.digest,
                decision: request.currentDecision,
                ...(entry.status ? { previousStatus: entry.status } : {}),
                nextStatus,
                previousChannels: channels(index),
                nextChannels: channels(nextIndex),
                provenance: { actor: request.actor, reason: request.reason },
                ...(action === "block" && "confirmation" in request ? { confirmation: request.confirmation } : {}),
                createdAt,
            });
            const layout = await ensureFsIntegrationRegistryLayout(this.config.root);
            const paths = await ensureVersionEligibilityPaths(layout, location, operationId, recordId);
            return await commitFsIntegrationRegistryVersionEligibility({
                config: { ...this.config, root: layout.root },
                paths,
                record,
                previousIndex: index,
                nextIndex,
            });
        });
    }
}

function assertStatusTransition(
    action: "block" | "mark-inadmissible",
    kind: string,
    version: string,
    current: "blocked" | "inadmissible" | "unverified" | undefined,
): void {
    if (current === "blocked" || (action === "mark-inadmissible" && current === "inadmissible")) {
        throw new IntegrationRegistryVersionEligibilityConflictError(
            `Integration version already has terminal eligibility status ${current}: ${kind}@${version}`,
        );
    }
}

function channels(index: Readonly<{ stable?: string; latest?: string }>) {
    return {
        ...(index.stable ? { stable: index.stable } : {}),
        ...(index.latest ? { latest: index.latest } : {}),
    };
}

export type { FsIntegrationRegistryVersionEligibilityManagerConfig } from "./types";
