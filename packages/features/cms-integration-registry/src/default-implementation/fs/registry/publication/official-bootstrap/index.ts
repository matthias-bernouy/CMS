import type {
    IntegrationRegistryPublicationResult,
    OfficialRepositoryBootstrapPlan,
} from "../../../../../interfaces/publication";
import { FsReviewedSchemaBaselineStore } from "../../baselines/store";
import { publishPreparedFsIntegrationRegistryCandidate } from "../publisher";
import { hydratePreparedOfficialBootstrap, preflightOfficialBootstrapPlan } from "./preflight";
import { assertCompleteStoredBootstrapBaselines } from "./storedBaselines";
import {
    PREPARED_OFFICIAL_BOOTSTRAP_SCHEMA,
    type FsOfficialIntegrationRegistryBootstrapPublisherConfig,
    type PreparedFsOfficialIntegrationRegistryBootstrap,
} from "./types";

/**
 * Privileged, resumable publisher for one reviewed legacy catalog plan.
 * Every restart rebuilds and revalidates the exact plan; no process-local
 * preparation is used as recovery authority.
 */
export class FsOfficialIntegrationRegistryBootstrapPublisher {
    constructor(private readonly config: FsOfficialIntegrationRegistryBootstrapPublisherConfig) {}

    async prepare(plan: OfficialRepositoryBootstrapPlan): Promise<PreparedFsOfficialIntegrationRegistryBootstrap> {
        const prepared = await preflightOfficialBootstrapPlan(this.config, plan);
        return Object.freeze({
            schema: PREPARED_OFFICIAL_BOOTSTRAP_SCHEMA,
            planDigest: prepared.planDigest,
            packageCount: prepared.packages.length,
            pendingPackageCount: prepared.packages.filter(({ report }) => report !== undefined).length,
            baselineCount: prepared.plan.reviewedSchemaBaselines.length,
            plan: prepared.plan,
        });
    }

    async publishPrepared(
        preparation: PreparedFsOfficialIntegrationRegistryBootstrap,
    ): Promise<readonly IntegrationRegistryPublicationResult[]> {
        const prepared = await preflightOfficialBootstrapPlan(
            this.config,
            hydratePreparedOfficialBootstrap(preparation),
        );
        if (
            prepared.planDigest !== preparation.planDigest ||
            prepared.packages.length !== preparation.packageCount ||
            prepared.plan.reviewedSchemaBaselines.length !== preparation.baselineCount ||
            prepared.packages.filter(({ report }) => report !== undefined).length !== preparation.pendingPackageCount
        ) {
            throw new TypeError("Official integration registry bootstrap preparation changed after preflight");
        }
        const results: IntegrationRegistryPublicationResult[] = [];
        for (const { candidate, report } of prepared.packages) {
            if (report) {
                results.push(
                    await publishPreparedFsIntegrationRegistryCandidate(this.config, candidate, undefined, report),
                );
            }
        }
        const baselines = this.config.baselineStore ?? new FsReviewedSchemaBaselineStore({ root: this.config.root });
        for (const baseline of prepared.plan.reviewedSchemaBaselines) {
            await baselines.append({ baseline, expectedCurrentRevisionId: null });
        }
        const completed = await preflightOfficialBootstrapPlan(
            this.config,
            hydratePreparedOfficialBootstrap(preparation),
        );
        if (completed.packages.some(({ report }) => report !== undefined)) {
            throw new Error("Official integration registry bootstrap did not commit the complete exact plan");
        }
        await assertCompleteStoredBootstrapBaselines(baselines, completed.plan);
        return Object.freeze(results);
    }
}

export type {
    FsOfficialIntegrationRegistryBootstrapPublisherConfig,
    PreparedFsOfficialIntegrationRegistryBootstrap,
} from "./types";
