import { randomUUID } from "node:crypto";
import {
    identifyIntegrationVerificationBackfillRequest,
    IntegrationVerificationBackfillError,
} from "../../../../../core/publication/backfill";
import type {
    IntegrationVerificationBackfiller,
    IntegrationVerificationBackfillRequest,
    IntegrationVerificationBackfillResult,
} from "../../../../../interfaces/publication";
import { removeFileIfExists } from "../../persistence/canonicalFile";
import {
    createIntegrationVerificationBackfillJournal,
    INTEGRATION_VERIFICATION_BACKFILL_JOURNAL_SCHEMA,
    type FsIntegrationVerificationBackfillJournal,
} from "./document";
import { ensureIntegrationVerificationBackfillStorage, integrationVerificationBackfillJournalPath } from "./layout";
import { integrationVerificationBackfillResult, notifyBoundary, replayIntegrationVerificationBackfill } from "./replay";
import type { FsIntegrationVerificationBackfillerConfig } from "./types";
import { FsIntegrationVerificationBackfillSimulatedCrashError } from "./types";
import {
    assertInitialIntegrationVerificationBackfillState,
    inspectIntegrationVerificationBackfillState,
    validateIntegrationVerificationBackfill,
} from "./validation";

export class FsIntegrationVerificationBackfiller implements IntegrationVerificationBackfiller {
    constructor(private readonly config: FsIntegrationVerificationBackfillerConfig) {}

    async backfill(request: IntegrationVerificationBackfillRequest): Promise<IntegrationVerificationBackfillResult> {
        const identified = await identifyIntegrationVerificationBackfillRequest(request);
        await validateIntegrationVerificationBackfill(this.config, identified);
        const operationId = this.config.createOperationId?.() ?? randomUUID();
        const state = assertInitialIntegrationVerificationBackfillState(
            await inspectIntegrationVerificationBackfillState(this.config, identified),
        );
        const journal: FsIntegrationVerificationBackfillJournal = {
            schema: INTEGRATION_VERIFICATION_BACKFILL_JOURNAL_SCHEMA,
            operationId,
            phase: "prepared",
            createdAt: this.config.now?.() ?? new Date().toISOString(),
            requestDigest: identified.digest,
            request: identified.request,
            activation: null,
        };
        if (state === "unchanged") {
            return integrationVerificationBackfillResult(journal, identified.decisionDigest, "unchanged");
        }
        const storage = await ensureIntegrationVerificationBackfillStorage(this.config.root);
        const path = integrationVerificationBackfillJournalPath(storage, operationId);
        await createIntegrationVerificationBackfillJournal(path, journal);
        try {
            await notifyBoundary(this.config, journal);
            return await replayIntegrationVerificationBackfill(this.config, path, journal);
        } catch (error) {
            if (error instanceof FsIntegrationVerificationBackfillSimulatedCrashError) {
                throw error;
            }
            const current = await inspectIntegrationVerificationBackfillState(this.config, identified).catch(
                () => null,
            );
            if (current && Object.values(current).every((value) => value === "absent")) {
                await removeFileIfExists(path);
                throw error;
            }
            throw new IntegrationVerificationBackfillError(
                503,
                "verification_backfill_recovery_required",
                "Integration verification backfill requires durable recovery",
                { cause: error },
            );
        }
    }
}
