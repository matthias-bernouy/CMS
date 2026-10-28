import { parseCapabilityGrants } from "@bernouy/cms-repository/providers/selections";
import type { ProviderCapabilityRegistry } from "../../../dispatch/registry";
import { ProviderCapabilityDispatchError } from "../../../dispatch/registry";
import type { UlviaProviderGateway } from "../../../ports";
import type { ProviderOperationExecutor } from "../../../operations/ProviderOperationExecutor";
import { collectionCommand, requiredText } from "../support";

export function registerContractUpgradeCapabilities(
    dispatcher: ProviderCapabilityRegistry,
    gateway: UlviaProviderGateway | undefined,
    operations?: ProviderOperationExecutor,
): void {
    const service = () => {
        if (!gateway?.contractUpgrades) {
            throw new ProviderCapabilityDispatchError("CORE_UNAVAILABLE", 503);
        }
        return gateway.contractUpgrades;
    };
    dispatcher.register("ulvia.cms.installations", "plan-contract-upgrade", async (input, context) =>
        collectionCommand(async () => {
            const selections =
                input.selection === undefined
                    ? targets(input.selections, context.siteId)
                    : await singleTarget(input, context.siteId, gateway!);
            const plan = await service().plan(
                context.siteId,
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
                authority: plan.authority,
                authorityAdded: plan.authorityAdded,
            };
        }),
    );
    dispatcher.register("ulvia.cms.installations", "get-contract-upgrade", async (input, context) => {
        const intent = await service().get(context.siteId, requiredText(input.upgradeId));
        if (!intent) {
            throw new ProviderCapabilityDispatchError("NOT_FOUND", 404);
        }
        return result(intent);
    });
    for (const capabilityId of ["apply-contract-upgrade", "resume-contract-upgrade"]) {
        if (!operations) {
            continue;
        }
        operations.register("ulvia.cms.installations", capabilityId, (input, context) =>
            collectionCommand(async () =>
                result(
                    capabilityId === "apply-contract-upgrade"
                        ? await service().apply(
                              context.siteId,
                              targets(input.selections, context.siteId),
                              input.grants === undefined ? undefined : parseCapabilityGrants(input.grants),
                              requiredText(input.planDigest),
                          )
                        : await service().resume(context.siteId, requiredText(input.upgradeId)),
                ),
            ),
        );
        dispatcher.register("ulvia.cms.installations", capabilityId, (input, context) =>
            operations.enqueue("ulvia.cms.installations", capabilityId, input, context),
        );
    }
}
function targets(value: unknown, siteId: string) {
    if (!Array.isArray(value) || value.length > 256) {
        throw new ProviderCapabilityDispatchError("INVALID_INPUT", 422);
    }
    return value.map((entry) => {
        if (!entry || typeof entry !== "object") {
            throw new ProviderCapabilityDispatchError("INVALID_INPUT", 422);
        }
        return {
            siteId,
            installationId: requiredText(entry.installationId),
            contractId: requiredText(entry.contractId),
            version: requiredText(entry.version),
            digest: requiredText(entry.digest),
        };
    });
}
function result(intent: { id: string; status: string; expectedRevision: number }) {
    return {
        upgradeId: intent.id,
        status: intent.status,
        selectionRevision: intent.expectedRevision + (intent.status === "completed" ? 1 : 0),
    };
}

async function singleTarget(input: Record<string, unknown>, siteId: string, gateway: UlviaProviderGateway) {
    if (input.selections !== undefined) {
        throw new ProviderCapabilityDispatchError("INVALID_INPUT", 422);
    }
    const [target] = targets([input.selection], siteId);
    const current = (await gateway.selections.get(siteId))?.plan.selections ?? [];
    return [...current.filter(({ contractId }) => contractId !== target!.contractId), target!];
}
