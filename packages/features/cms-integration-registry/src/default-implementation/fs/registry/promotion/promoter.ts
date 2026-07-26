import { randomUUID } from "node:crypto";
import { isIntegrationPrerelease } from "@bernouy/cms-integrations";
import {
    IntegrationRegistryStablePromotionConflictError,
    IntegrationRegistryStablePromotionIneligibleError,
    IntegrationRegistryStablePromotionNotFoundError,
    IntegrationRegistryStablePromotionStaleReportError,
} from "../../../../core/promotion/errors";
import { validateStablePromotionRequest } from "../../../../core/promotion/request";
import type {
    IntegrationRegistryStablePromoter,
    IntegrationRegistryStablePromotionRecord,
    IntegrationRegistryStablePromotionRequest,
} from "../../../../interfaces/promotion";
import { ensureFsIntegrationRegistryLayout } from "../persistence/layout";
import { parseStablePromotionRecord } from "./document";
import { nextStableIntegrationRegistryIndex } from "./index";
import { ensureStablePromotionPaths } from "./layout";
import { commitFsIntegrationRegistryStablePromotion } from "./transaction/commit";
import type { FsIntegrationRegistryStablePromoterConfig } from "./types";

export class FsIntegrationRegistryStablePromoter implements IntegrationRegistryStablePromoter {
    constructor(private readonly config: FsIntegrationRegistryStablePromoterConfig) {}

    async promoteStable(request: IntegrationRegistryStablePromotionRequest) {
        const validated = validateStablePromotionRequest(request);
        const operationId = this.config.createOperationId?.() ?? randomUUID();
        const promotionId = this.config.createPromotionId?.() ?? randomUUID();
        return await this.config.mutations.runExclusive(validated.kind, async () => {
            const snapshot = this.config.snapshots.current();
            const index = snapshot.getIndex(validated.kind);
            const location = snapshot.locateExactVersion(validated.kind, validated.version);
            if (!index || !location) {
                throw new IntegrationRegistryStablePromotionNotFoundError(validated.kind, validated.version);
            }
            const versionEntry = index.versions.find((entry) => entry.version === validated.version);
            if (!versionEntry || versionEntry.status) {
                throw new IntegrationRegistryStablePromotionIneligibleError(
                    validated.kind,
                    validated.version,
                    validated.currentReportRevisionId,
                    `A ${versionEntry?.status ?? "missing"} version cannot be promoted to stable`,
                );
            }
            const evidence = await currentPromotionEvidence(this.config, validated.kind, validated.version);
            if (!evidence) {
                throw new IntegrationRegistryStablePromotionNotFoundError(validated.kind, validated.version);
            }
            if (evidence.revisionId !== validated.currentReportRevisionId) {
                throw new IntegrationRegistryStablePromotionStaleReportError(
                    validated.currentReportRevisionId,
                    evidence.revisionId,
                );
            }
            if (isIntegrationPrerelease(validated.version)) {
                throw new IntegrationRegistryStablePromotionIneligibleError(
                    validated.kind,
                    validated.version,
                    evidence.revisionId,
                    "Prerelease versions cannot be promoted to stable",
                );
            }
            if (!evidence.admissible) {
                throw new IntegrationRegistryStablePromotionIneligibleError(
                    validated.kind,
                    validated.version,
                    evidence.revisionId,
                    `The current ${evidence.label} does not admit this version`,
                );
            }
            if (index.stable === validated.version) {
                throw new IntegrationRegistryStablePromotionConflictError(validated.kind, validated.version);
            }
            const createdAt = this.config.now?.() ?? new Date().toISOString();
            const record: IntegrationRegistryStablePromotionRecord = parseStablePromotionRecord({
                schema: evidence.digest
                    ? "cms.integration.registry.stable-promotion.v2"
                    : "cms.integration.registry.stable-promotion.v1",
                id: promotionId,
                operationId,
                kind: validated.kind,
                version: validated.version,
                packageDigest: location.package.digest,
                reportRevisionId: evidence.revisionId,
                ...(evidence.digest
                    ? {
                          reportDigest: evidence.digest,
                          reportType: "release-admission-decision",
                      }
                    : {}),
                ...(index.stable ? { previousStable: index.stable } : {}),
                actor: validated.actor,
                confirmation: validated.confirmation,
                createdAt,
                ...(validated.reason ? { reason: validated.reason } : {}),
            });
            const layout = await ensureFsIntegrationRegistryLayout(this.config.root);
            const paths = await ensureStablePromotionPaths(layout, location, operationId, promotionId);
            return await commitFsIntegrationRegistryStablePromotion({
                config: { ...this.config, root: layout.root },
                paths,
                record,
                previousIndex: index,
                nextIndex: nextStableIntegrationRegistryIndex(index, validated.version),
            });
        });
    }
}

async function currentPromotionEvidence(
    config: FsIntegrationRegistryStablePromoterConfig,
    kind: string,
    version: string,
): Promise<Readonly<{ revisionId: string; digest?: string; admissible: boolean; label: string }> | null> {
    if (config.decisions) {
        const history = await config.decisions.get(kind, version);
        return history
            ? {
                  revisionId: history.currentRevisionId,
                  digest: history.currentReportDigest,
                  admissible: history.current.admissible,
                  label: "release admission decision",
              }
            : null;
    }
    const history = await config.reports.get(kind, version);
    return history
        ? {
              revisionId: history.current.id,
              admissible: history.current.admissible,
              label: "legacy compatibility report",
          }
        : null;
}

export type { FsIntegrationRegistryStablePromoterConfig } from "./types";
