import type { ContractUpgradePlan } from "cms-repository/exports/providers/selections";
/** Human-readable labels belong to the HTTP projection, not persisted authority records. */
export function authorityReview(plan: Pick<ContractUpgradePlan, "authority" | "authorityAdded">) {
    const label = (index: number) => {
        const capability = plan.authority.capabilities[index];
        if (!capability) {
            throw new Error("Invalid authority capability reference");
        }
        return `${capability.selection.installationId} · ${capability.contractId}@${capability.version} · ${capability.capabilityId}`;
    };
    const pairs = (entries: ContractUpgradePlan["authorityAdded"]) =>
        entries.map((entry) => ({
            ...entry,
            sourceLabel: label(entry.source),
            targetLabel: label(entry.target),
        }));
    return {
        authority: {
            ...plan.authority,
            machine: plan.authority.machine.map((entry) => ({ ...entry, targetLabel: label(entry.target) })),
            delegated: pairs(plan.authority.delegated),
        },
        authorityAdded: pairs(plan.authorityAdded),
    };
}
