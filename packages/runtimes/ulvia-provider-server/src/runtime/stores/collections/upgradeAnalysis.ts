import { validateCapabilityUsage } from "@bernouy/cms-repository/providers/selections";
import type {
    CollectionUpgradeAnalysis,
    CapabilityUse,
    UpgradeIssue,
} from "@bernouy/cms-repository/collections/installations";
import type {
    ContractSelectionStore,
    ContractSelectionDependencySource,
} from "@bernouy/cms-repository/providers/selections";
import { type ReleaseCatalogue } from "@bernouy/cms-repository/contracts/catalogue";

/** Explicit Edge/Provider consumers; catalogue-only demonstrations add no execution grant. */
const INTERNAL = [
    ["ulvia.cms.observability", "logs.append"],
    ["ulvia.cms.observability", "logs.query"],
    ["ulvia.cms.observability", "logs.get"],
    ["ulvia.cms.observability", "logs.aggregate"],
    ["ulvia.cms.content", "delivery.resolve-path"],
    ["ulvia.cms.installations", "capabilities.describe"],
    ["ulvia.cms.access", "resolve-actor"],
    ["ulvia.cms.installations", "list-provider-installations"],
    ["ulvia.cms.installations", "gateway.route.get"],
    ["ulvia.cms.installations", "gateway.identity.resolve"],
    ["ulvia.cms.installations", "gateway.audit.append"],
    ["ulvia.cms.installations", "gateway.invocation.issue"],
] as const;

export function createCollectionUpgradeAnalysis(
    siteId: string,
    selections: ContractSelectionStore,
    releases: ReleaseCatalogue,
    dependencies: ContractSelectionDependencySource,
): CollectionUpgradeAnalysis {
    return {
        requiredConsumers: ["edge-provider"],
        contributors: [
            {
                id: "edge-provider",
                snapshot: async () => {
                    const selected = await selections.get(siteId);
                    return {
                        revision: JSON.stringify({
                            selected,
                            dependencyRevision: (await dependencies.capture(siteId)).revision,
                        }),
                        complete: selected !== null,
                        references: INTERNAL.map(
                            ([contractId, capabilityId]): CapabilityUse => ({
                                type: "capability",
                                contractId,
                                capabilityId,
                                versionRange: "^1.0.0",
                                scope: "runtime",
                                location: `internal:edge-provider/${contractId}/${capabilityId}`,
                            }),
                        ),
                    };
                },
            },
        ],
        validateCapabilities: async (references) => {
            const selected = await selections.get(siteId);
            if (!selected) {
                return [{ code: "incomplete", location: "selections", message: "Contract selections are unavailable" }];
            }
            const issues = await validateCapabilityUsage(
                { complete: true, revision: String(selected.revision), requirements: references, unknown: [] },
                selected.plan.selections,
                selected.plan.selections,
                selected.grants,
                selected.plan.dependencies,
                releases,
            );
            return issues.map(
                (issue): UpgradeIssue => ({
                    ...issue,
                    code: issue.code === "incomplete" ? "incomplete" : "invalid-capability",
                }),
            );
        },
    };
}
