import { runSiteUpgrade } from "cms-repository/site-upgrades/run";
import { siteUsageInventory } from "../usage/inventory";
import type { ContentRepository } from "@bernouy/cms-content";
import type { CollectionStore } from "../../core/CollectionStore";
import type { CollectionUpgradeTarget, CollectionUpgradePlan } from "../interfaces";
import type { UpgradeIntent, CollectionUpgradePayload } from "../storage/interfaces";
import type { SiteUpgradeStorage } from "cms-repository/site-upgrades/interfaces";
import { prepareCollectionUpgrade, type CollectionUpgradeAnalysis } from "../planning/plan";
import { usageDigest } from "../usage/snapshot";
import { issueUpgradePermit } from "./permit";

export class CollectionUpgradeService {
    constructor(
        private readonly repository: ContentRepository,
        private readonly collections: CollectionStore,
        readonly storage: SiteUpgradeStorage,
        private readonly analysis: CollectionUpgradeAnalysis,
        private readonly onCommitted: (siteId: string) => Promise<void> = async () => {},
    ) {}
    inventory(siteId: string) {
        return siteUsageInventory(
            this.repository,
            this.collections,
            siteId,
            this.analysis.contributors,
            this.analysis.requiredConsumers,
        );
    }
    plan(
        siteId: string,
        targets: readonly CollectionUpgradeTarget[],
        artifacts: readonly {
            digest: string;
            release: import("../../../interfaces/CollectionRelease").CollectionRelease;
        }[] = [],
    ): Promise<CollectionUpgradePlan> {
        return prepareCollectionUpgrade(
            this.repository,
            this.collections,
            siteId,
            targets,
            this.analysis,
            async (digest) =>
                artifacts.find((artifact) => artifact.digest === digest) ?? this.collections.getRelease(digest),
        );
    }
    async apply(
        siteId: string,
        targets: readonly CollectionUpgradeTarget[],
        planDigest: string,
    ): Promise<UpgradeIntent> {
        const existing = await this.storage.get<CollectionUpgradePayload>(
            siteId,
            usageDigest({ siteId, planDigest }),
            "collection",
        );
        if (existing) {
            if (usageDigest(existing.payload.targets) !== usageDigest(targets)) {
                throw conflict("Upgrade retry changed its reviewed targets");
            }
            return this.run(existing);
        }
        const plan = await this.plan(siteId, targets);
        if (plan.planDigest !== planDigest || plan.status !== "applicable") {
            throw conflict("The upgrade plan is stale, blocked or incomplete");
        }
        const snapshot = await this.collections.snapshot(siteId);
        const source = snapshot.collections.map(({ release: _, ...installation }) => installation);
        const replacements = new Map(plan.replacements.map((replacement) => [replacement.collectionId, replacement]));
        const intent = await this.storage.begin({
            id: usageDigest({ siteId, planDigest }),
            siteId,
            planDigest,
            kind: "collection",
            payload: { targets: structuredClone(targets), replacements: plan.replacements },
            expectedRevision: plan.expectedRevision,
            sourceStateDigest: usageDigest({ revision: plan.expectedRevision, installations: source }),
            targetStateDigest: usageDigest({
                revision: plan.expectedRevision + 1,
                installations: source.map((installed) => replacements.get(installed.collectionId) ?? installed),
            }),
            status: "prepared",
            createdAt: new Date().toISOString(),
        });
        return this.run(intent);
    }
    async resume(siteId: string, id: string): Promise<UpgradeIntent> {
        const intent = await this.storage.get<CollectionUpgradePayload>(siteId, id, "collection");
        if (!intent) {
            throw Object.assign(new Error("Collection upgrade not found"), { status: 404 });
        }
        return this.run(intent);
    }
    private run(intent: UpgradeIntent): Promise<UpgradeIntent> {
        return runSiteUpgrade(this.storage, intent, {
            validatePrepared: async (current) => {
                const fresh = await this.plan(current.siteId, current.payload.targets);
                return fresh.planDigest === current.planDigest && fresh.status === "applicable";
            },
            stateDigest: () => this.stateDigest(intent.siteId),
            commit: async (current, assertLease) => {
                const permit = issueUpgradePermit(
                    current.siteId,
                    current.expectedRevision,
                    current.payload.replacements,
                    assertLease,
                );
                return this.collections.commitUpgrade(
                    current.siteId,
                    current.payload.replacements,
                    current.expectedRevision,
                    permit,
                );
            },
            onCommitted: () => this.onCommitted(intent.siteId),
        });
    }
    private async stateDigest(siteId: string): Promise<string> {
        const snapshot = await this.collections.snapshot(siteId);
        return usageDigest({
            revision: snapshot.revision,
            installations: snapshot.collections.map(({ release: _, ...installation }) => installation),
        });
    }
}
function conflict(message: string): Error {
    return Object.assign(new Error(message), { status: 409 });
}
