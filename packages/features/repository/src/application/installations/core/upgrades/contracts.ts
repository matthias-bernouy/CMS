import { parseCapabilityGrants } from "@bernouy/ulvia-providers/selections";
import type { InstallationServices } from "repository/application/installations/interfaces/services";
import type {
    PlanContractUpgradeInput,
    ApplyContractUpgradeInput,
} from "repository/application/installations/interfaces/inputs";
import { required } from "repository/application/installations/core/requirements";
import { InstallationError } from "repository/application/installations/core/errors";
import { authorityReview } from "repository/application/installations/core/upgrades/review";
export function contractUpgrades(services: InstallationServices) {
    return required(services.gateway?.contractUpgrades);
}
export function selectionTargets(targets: ApplyContractUpgradeInput["selections"], siteId: string) {
    return targets.map((target) => ({ ...target, siteId }));
}
export function projectContractUpgrade(intent: {
    id: string;
    status: "prepared" | "applying" | "completed" | "cancelled";
    expectedRevision: number;
}) {
    return {
        upgradeId: intent.id,
        status: intent.status,
        selectionRevision: intent.expectedRevision + (intent.status === "completed" ? 1 : 0),
    };
}
export async function contractUpgrade(services: InstallationServices, siteId: string, upgradeId: string) {
    const intent = await contractUpgrades(services).get(siteId, upgradeId);
    if (!intent) {
        throw new InstallationError("NOT_FOUND");
    }
    return projectContractUpgrade(intent);
}
export async function planContracts(services: InstallationServices, siteId: string, input: PlanContractUpgradeInput) {
    let selections;
    if (input.selection !== undefined) {
        if (input.selections !== undefined) {
            throw new InstallationError("INVALID_INPUT");
        }
        const [target] = selectionTargets([input.selection], siteId);
        const current = (await required(services.gateway).selections.get(siteId))?.plan.selections ?? [];
        selections = [...current.filter(({ contractId }) => contractId !== target!.contractId), target!];
    } else {
        if (input.selections === undefined) {
            throw new InstallationError("INVALID_INPUT");
        }
        selections = selectionTargets(input.selections, siteId);
    }
    const plan = await contractUpgrades(services).plan(
        siteId,
        selections,
        input.grants === undefined ? undefined : parseCapabilityGrants(input.grants),
    );
    return {
        status: plan.status,
        planDigest: plan.planDigest,
        expectedRevision: plan.expectedRevision,
        issues: plan.issues.slice(0, 1024),
        issueCount: plan.issues.length,
        selections: plan.selections.map(({ siteId: _, ...selection }) => selection),
        source: plan.source.map(({ siteId: _, ...selection }) => selection),
        usageDigest: plan.usageRevision,
        grants: plan.grants,
        ...authorityReview(plan),
    };
}
