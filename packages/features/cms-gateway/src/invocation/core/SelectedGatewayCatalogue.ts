import type { UlviaObjectSchema, UlviaSchema } from "@bernouy/cms-repository/contracts/schema";
import { satisfiesVersionRange } from "@bernouy/cms-repository/contracts/compatibility";
import type { CollectionCapabilityRequirement } from "@bernouy/cms-repository/collections";
import type { ContractSelectionStore } from "@bernouy/cms-repository/providers/selections";
import type { GatewayRouteResolver } from "cms-gateway/invocation/interfaces/Invocation";
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
        for (const selection of stored.plan.selections) {
            const route = await this.routes.resolve(siteId, selection.contractId);
            if (!route) {
                continue;
            }
            try {
                resolveRoute(
                    route,
                    siteId,
                    selection.contractId,
                    (this.options.now ?? (() => new Date().toISOString()))(),
                    this.options.maxObservationAgeMs ?? 60_000,
                );
            } catch (error) {
                if (
                    error instanceof GatewayError &&
                    (error.code === "installation_unavailable" || error.code === "not_ready")
                ) {
                    continue;
                }
                throw error;
            }
            const release = route.release.admission.release;
            const provider = route.manifest.admission.manifest;
            for (const capability of release.capabilities) {
                const binding = route.release.admission.bindings.find(
                    (item) => item.capabilityId === capability.id,
                )?.binding;
                if (
                    (capability.access !== "public" && capability.access !== "authenticated") ||
                    capability.behavior.execution !== "sync" ||
                    (capability.behavior.effect === "command" && capability.behavior.idempotency === "keyed") ||
                    capability.output.type === "binary" ||
                    !binding ||
                    binding.body?.kind === "binary"
                ) {
                    continue;
                }
                listed.push({
                    contractId: selection.contractId,
                    contractLabel: release.name,
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
                const release = route.release.admission.release;
                const selected = {
                    selectedVersion: release.version,
                    installationId: route.installation.installation.id,
                };
                if (
                    !satisfiesVersionRange(release.version, requirement.versionRange) ||
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
