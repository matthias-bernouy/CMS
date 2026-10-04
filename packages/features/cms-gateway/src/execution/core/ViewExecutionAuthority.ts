import { satisfiesVersionRange } from "@bernouy/cms-repository/contracts/compatibility";
import { canonicalizeIJson, deepFreeze } from "@bernouy/cms-repository/contracts/protocol";
import type { ContractSelectionStore } from "@bernouy/cms-repository/providers/selections";
import { GatewayError } from "cms-gateway/invocation/core/GatewayError";
import type { GatewayRouteResolver } from "cms-gateway/invocation/interfaces/Invocation";
import type {
    CollectionViewExecutionActivation,
    CollectionViewExecutionAuthority,
    CollectionViewExecutionPlan,
    CollectionViewExecutionRequest,
    GatewayExecutionPin,
    StoredCollectionViewExecutionGrant,
} from "../interfaces/ViewExecution";
import type { CollectionViewExecutionGrantStore } from "../interfaces/ViewExecutionGrantStore";
import {
    digestPlan,
    requireExecutionIdentifier,
    sameSelection,
    snapshotActivation,
    snapshotConsumer,
} from "./executionValues";

/** Compiles and enforces site-owned grants without selecting or upgrading providers. */
export class DefaultCollectionViewExecutionAuthority implements CollectionViewExecutionAuthority {
    constructor(
        private readonly selections: Pick<ContractSelectionStore, "get">,
        private readonly routes: GatewayRouteResolver,
        private readonly grants: CollectionViewExecutionGrantStore,
    ) {}

    async activate(input: CollectionViewExecutionActivation): Promise<StoredCollectionViewExecutionGrant> {
        const activation = snapshotActivation(input);
        const plan = await this.#compile(activation);
        const planDigest = await digestPlan(plan);
        for (let attempt = 0; attempt < 2; attempt += 1) {
            const current = await this.grants.get(plan.consumer);
            if (current?.planDigest === planDigest) {
                return deepFreeze(structuredClone(current));
            }
            const grant = { revision: (current?.revision ?? 0) + 1, planDigest, plan } as const;
            if (await this.grants.replace(grant, current?.revision ?? 0)) {
                return deepFreeze(structuredClone(grant));
            }
        }
        throw new GatewayError("stale_route", "view execution grant changed during activation");
    }

    async authorize(input: CollectionViewExecutionRequest): Promise<GatewayExecutionPin> {
        const consumer = snapshotConsumer(input);
        requireExecutionIdentifier(input.contractId, "contract");
        requireExecutionIdentifier(input.capabilityId, "capability");
        const [grant, selections] = await Promise.all([
            this.grants.get(consumer),
            this.selections.get(consumer.siteId),
        ]);
        if (!grant) {
            throw new GatewayError("not_authorized", "this collection view has no active execution grant");
        }
        if (canonicalizeIJson(grant.plan.consumer) !== canonicalizeIJson(consumer)) {
            throw new GatewayError(
                "stale_route",
                "the collection view changed after its execution grant was activated",
            );
        }
        if (
            !selections ||
            selections.revision !== grant.plan.selectionRevision ||
            selections.dependencyRevision !== grant.plan.dependencyRevision
        ) {
            throw new GatewayError("stale_route", "provider selections changed after the view was activated");
        }
        const target = grant.plan.targets.find((item) => item.contractId === input.contractId);
        if (!target?.capabilityIds.includes(input.capabilityId)) {
            throw new GatewayError("not_authorized", "capability is outside the collection view execution grant");
        }
        return {
            planDigest: grant.planDigest,
            version: target.version,
            digest: target.digest,
            installationId: target.installationId,
        };
    }

    async #compile(input: CollectionViewExecutionActivation): Promise<CollectionViewExecutionPlan> {
        const stored = await this.selections.get(input.consumer.siteId);
        if (!stored) {
            throw new GatewayError("not_selected", "site has no provider selections for this view");
        }
        const grouped = new Map<string, typeof input.requirements>();
        for (const requirement of input.requirements) {
            grouped.set(requirement.contractId, [...(grouped.get(requirement.contractId) ?? []), requirement]);
        }
        const targets = [];
        for (const [contractId, requirements] of [...grouped].sort(([left], [right]) => left.localeCompare(right))) {
            const selected = stored.plan.selections.find((item) => item.contractId === contractId);
            const route = await this.routes.resolve(input.consumer.siteId, contractId);
            if (!selected || !route || !sameSelection(selected, route.selection)) {
                throw new GatewayError("stale_route", `provider selection for ${contractId} changed during planning`);
            }
            const release = route.release.admission.release;
            if (
                requirements.some(
                    (requirement) =>
                        !satisfiesVersionRange(release.version, requirement.versionRange) ||
                        !release.capabilities.some((capability) => capability.id === requirement.capabilityId),
                )
            ) {
                throw new GatewayError("not_selected", `selected ${contractId} release does not satisfy this view`);
            }
            targets.push({
                contractId,
                capabilityIds: [...new Set(requirements.map((item) => item.capabilityId))].sort(),
                version: selected.version,
                digest: selected.digest,
                installationId: selected.installationId,
            });
        }
        const current = await this.selections.get(input.consumer.siteId);
        if (
            !current ||
            current.revision !== stored.revision ||
            current.dependencyRevision !== stored.dependencyRevision
        ) {
            throw new GatewayError("stale_route", "provider selections changed during view planning");
        }
        return deepFreeze({
            protocol: "ulvia-view-execution/v1",
            consumer: input.consumer,
            selectionRevision: stored.revision,
            dependencyRevision: stored.dependencyRevision,
            requirements: input.requirements,
            targets,
        });
    }
}
