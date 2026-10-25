import type { UlviaObjectSchema, UlviaSchema } from "@bernouy/cms-repository/contracts/schema";
import { satisfiesVersionRange } from "@bernouy/cms-repository/contracts/compatibility";
import type { CollectionCapabilityRequirement } from "@bernouy/cms-repository/collections";
import type { ContractSelectionStore } from "@bernouy/cms-repository/providers/selections";
import type { GatewayRoute, GatewayRouteResolver } from "cms-gateway/invocation/interfaces/Invocation";
import { GatewayError } from "cms-gateway/invocation/core/GatewayError";
import { resolveRoute } from "cms-gateway/invocation/core/resolveRoute";

export interface GatewayEditorCapability {
    readonly contractId: string;
    readonly contractLabel: string;
    readonly capabilityId: string;
    readonly description?: string;
    readonly providerId: string;
    readonly providerLabel: string;
    readonly access: "public" | "authenticated";
    readonly effect: "query" | "command";
    readonly input: UlviaObjectSchema;
    readonly output: UlviaSchema;
}

export interface GatewayCapabilityCatalogue {
    list(siteId: string): Promise<readonly GatewayEditorCapability[]>;
    checkRequirements(
        siteId: string,
        requirements: readonly CollectionCapabilityRequirement[],
    ): Promise<readonly GatewayRequirementReadiness[]>;
}

export interface GatewayRequirementReadiness extends CollectionCapabilityRequirement {
    readonly status: "ready" | "missing" | "degraded";
    readonly selectedVersion?: string;
    readonly installationId?: string;
    readonly reason?: string;
}

export interface SelectedGatewayCatalogueOptions {
    readonly now?: () => string;
    readonly maxObservationAgeMs?: number;
}

/** Editor catalogue derived only from the site's exact selected releases. */
export class SelectedGatewayCatalogue implements GatewayCapabilityCatalogue {
    constructor(
        private readonly selections: Pick<ContractSelectionStore, "get">,
        private readonly routes: GatewayRouteResolver,
        private readonly options: SelectedGatewayCatalogueOptions = {},
    ) {}

    async list(siteId: string): Promise<readonly GatewayEditorCapability[]> {
        const stored = await this.selections.get(siteId);
        if (!stored) {
            return [];
        }
        const listed: GatewayEditorCapability[] = [];
        const now = (this.options.now ?? (() => new Date().toISOString()))();
        const maxAgeMs = this.options.maxObservationAgeMs ?? 60_000;
        for (const selection of stored.plan.selections) {
            const concreteRoute = await this.routes.resolve(siteId, selection.contractId);
            if (!concreteRoute) {
                continue;
            }
            const provider = concreteRoute.manifest.admission.manifest;
            for (const owner of concreteRoute.lineage) {
                const route =
                    owner.contractId === selection.contractId
                        ? concreteRoute
                        : await this.routes.resolve(siteId, owner.contractId);
                if (!route || !isAvailable(route, siteId, owner.contractId, now, maxAgeMs)) {
                    continue;
                }
                const release = route.requestedRelease.admission.release;
                for (const capability of release.capabilities) {
                    if (
                        (capability.access !== "public" && capability.access !== "authenticated") ||
                        capability.behavior.execution !== "sync" ||
                        (capability.behavior.effect === "command" && capability.behavior.idempotency === "keyed") ||
                        capability.output.type === "binary" ||
                        Object.values(capability.input.properties).some((schema) => schema.type === "binary")
                    ) {
                        continue;
                    }
                    listed.push({
                        contractId: owner.contractId,
                        contractLabel: owner.name,
                        capabilityId: capability.id,
                        ...(capability.description ? { description: capability.description } : {}),
                        providerId: provider.providerId,
                        providerLabel: provider.name,
                        access: capability.access,
                        effect: capability.behavior.effect,
                        input: capability.input,
                        output: capability.output,
                    });
                }
            }
        }
        return listed.sort(
            (left, right) =>
                left.contractId.localeCompare(right.contractId) || left.capabilityId.localeCompare(right.capabilityId),
        );
    }

    async checkRequirements(
        siteId: string,
        requirements: readonly CollectionCapabilityRequirement[],
    ): Promise<readonly GatewayRequirementReadiness[]> {
        const now = (this.options.now ?? (() => new Date().toISOString()))();
        const maxAgeMs = this.options.maxObservationAgeMs ?? 60_000;
        return Promise.all(
            requirements.map(async (requirement): Promise<GatewayRequirementReadiness> => {
                const route = await this.routes.resolve(siteId, requirement.contractId);
                if (!route) {
                    return { ...requirement, status: "missing", reason: "No contract release is selected" };
                }
                const release = route.requestedRelease.admission.release;
                const implemented = route.lineage.find((entry) => entry.contractId === requirement.contractId);
                const selected = {
                    selectedVersion: implemented?.version,
                    installationId: route.installation.installation.id,
                };
                if (
                    !implemented ||
                    !satisfiesVersionRange(implemented.version, requirement.versionRange) ||
                    !release.capabilities.some((capability) => capability.id === requirement.capabilityId)
                ) {
                    return {
                        ...requirement,
                        ...selected,
                        status: "missing",
                        reason: "The selected release does not satisfy this requirement",
                    };
                }
                try {
                    resolveRoute(route, siteId, requirement.contractId, now, maxAgeMs);
                    return { ...requirement, ...selected, status: "ready" };
                } catch (error) {
                    if (
                        error instanceof GatewayError &&
                        (error.code === "installation_unavailable" || error.code === "not_ready")
                    ) {
                        return { ...requirement, ...selected, status: "degraded", reason: error.message };
                    }
                    throw error;
                }
            }),
        );
    }
}

function isAvailable(route: GatewayRoute, siteId: string, contractId: string, now: string, maxAgeMs: number): boolean {
    try {
        resolveRoute(route, siteId, contractId, now, maxAgeMs);
        return true;
    } catch (error) {
        if (
            error instanceof GatewayError &&
            (error.code === "installation_unavailable" || error.code === "not_ready")
        ) {
            return false;
        }
        throw error;
    }
}
