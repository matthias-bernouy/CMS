import type { UlviaObjectSchema, UlviaSchema } from "@bernouy/cms-repository/contracts/schema";
import type { ContractSelectionStore } from "@bernouy/cms-repository/providers/selections";
import type { GatewayRouteResolver } from "../interfaces/Invocation";

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
}

/** Editor catalogue derived only from the site's exact selected releases. */
export class SelectedGatewayCatalogue implements GatewayCapabilityCatalogue {
    constructor(
        private readonly selections: Pick<ContractSelectionStore, "get">,
        private readonly routes: GatewayRouteResolver,
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
}
