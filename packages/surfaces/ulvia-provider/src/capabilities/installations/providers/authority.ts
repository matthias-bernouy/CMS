import { ProviderCapabilityDispatchError, type ProviderCapabilityRegistry } from "../../../dispatch/registry";
import type { UlviaProviderGateway } from "../../../ports";
import { requiredText } from "../support";

export function registerProviderAuthorityCapabilities(
    dispatcher: ProviderCapabilityRegistry,
    gateway?: UlviaProviderGateway,
) {
    dispatcher.register("ulvia.cms.installations", "gateway.provider.resolve", async (input, context) => {
        if (!context.controlAuthority || !gateway?.providers) {
            throw new ProviderCapabilityDispatchError("FORBIDDEN", 403);
        }
        return { installationId: await gateway.providers.authenticate(requiredText(input.token)) };
    });
    dispatcher.register("ulvia.cms.installations", "gateway.provider.authorize", async (input, context) => {
        if (!context.controlAuthority || !gateway?.providers) {
            throw new ProviderCapabilityDispatchError("FORBIDDEN", 403);
        }
        return {
            allowed: await gateway.providers.authorize({
                sourceInstallationId: requiredText(input.sourceInstallationId),
                sourceCredentialFingerprint: requiredText(input.sourceCredentialFingerprint),
                targetInstallationId: requiredText(input.targetInstallationId),
                contractId: requiredText(input.contractId),
                capabilityId: requiredText(input.capabilityId),
                version: requiredText(input.version),
            }),
        };
    });
}
