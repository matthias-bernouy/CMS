import { ProviderConnectionConflict, type ProviderConnectionRegistry } from "@bernouy/cms-gateway/provider";
import { ProviderCapabilityDispatchError, type ProviderCapabilityRegistry } from "../dispatch/registry";

export function registerProviderConnectionCapabilities(
    dispatcher: ProviderCapabilityRegistry,
    connections: ProviderConnectionRegistry,
) {
    dispatcher.register("ulvia.provider.connections", "connections.configure", async (input, context) => {
        if (
            context.connectionId !== input.connectionId ||
            context.subjectId ||
            context.sourceInstallationId ||
            context.systemServiceId
        ) {
            throw new ProviderCapabilityDispatchError("FORBIDDEN", 403);
        }
        try {
            return await connections.configure({
                connectionId: String(input.connectionId),
                cmsUrl: String(input.cmsUrl),
                token: String(input.token),
                generation: Number(input.generation),
            });
        } catch (error) {
            if (error instanceof ProviderConnectionConflict) {
                throw new ProviderCapabilityDispatchError("REVISION_CONFLICT", 409);
            }
            throw error;
        }
    });
}
