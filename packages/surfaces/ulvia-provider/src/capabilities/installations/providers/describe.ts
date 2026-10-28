import type { ProviderCapabilityRegistry } from "../../../dispatch/registry";
import { ProviderCapabilityDispatchError } from "../../../dispatch/registry";
import type { UlviaProviderGateway } from "../../../ports";

export function registerCapabilityDescription(
    dispatcher: ProviderCapabilityRegistry,
    gateway?: UlviaProviderGateway,
): void {
    dispatcher.register("ulvia.cms.installations", "capabilities.describe", async (input) => {
        if (!gateway || typeof input.contractId !== "string") {
            throw new ProviderCapabilityDispatchError("CORE_UNAVAILABLE", 503);
        }
        const route = await gateway.routes.resolve(gateway.siteId, input.contractId);
        const release = route?.requestedRelease.admission.release;
        if (!release) {
            return { found: false, version: "", capabilities: [] };
        }
        if (release.capabilities.length > 256) {
            throw new ProviderCapabilityDispatchError("CORE_UNAVAILABLE", 503);
        }
        return {
            found: true,
            version: release.version,
            capabilities: release.capabilities.map((capability) => ({
                id: capability.id,
                access: capability.access,
                effect: capability.behavior.effect,
                sensitive: capability.behavior.sensitive,
            })),
        };
    });
}
