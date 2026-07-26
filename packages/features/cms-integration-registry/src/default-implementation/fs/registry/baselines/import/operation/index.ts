import { randomUUID } from "node:crypto";
import { identifyReviewedSchemaBaselineImportRequest } from "../../../../../../core/baselines/request";
import type {
    ReviewedSchemaBaselineImporter,
    ReviewedSchemaBaselineImportRequest,
    ReviewedSchemaBaselineImportResult,
} from "../../../../../../interfaces/reportStore";
import type { FsReviewedSchemaBaselineImporterConfig } from "../types";
import { identifyReviewedSchemaBaselineImportPolicy } from "../validation";
import { validateAndAppendReviewedSchemaBaselineImport } from "./lifecycle";

export class FsReviewedSchemaBaselineImporter implements ReviewedSchemaBaselineImporter {
    constructor(private readonly config: FsReviewedSchemaBaselineImporterConfig) {}

    async importBaseline(request: ReviewedSchemaBaselineImportRequest): Promise<ReviewedSchemaBaselineImportResult> {
        const identified = await identifyReviewedSchemaBaselineImportRequest(request);
        const policyDigest = await identifyReviewedSchemaBaselineImportPolicy(
            this.config.approval,
            this.config.approvedTargets,
        );
        const operationId = this.config.createOperationId?.() ?? randomUUID();
        return await this.config.mutations.runExclusive(identified.request.baseline.kind, async () => {
            const result = await validateAndAppendReviewedSchemaBaselineImport({
                config: this.config,
                operationId,
                request: identified.request,
                requestDigest: identified.digest,
                policyDigest,
                journal: true,
            });
            return result.result;
        });
    }
}

export { validateAndAppendReviewedSchemaBaselineImport } from "./lifecycle";
