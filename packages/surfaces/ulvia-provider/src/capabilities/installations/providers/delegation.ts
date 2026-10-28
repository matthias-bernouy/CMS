import { GatewayError } from "@bernouy/cms-gateway";
import { ProviderCapabilityDispatchError, type ProviderCapabilityRegistry } from "../../../dispatch/registry";
import type { UlviaProviderGateway } from "../../../ports";
import type { DelegationSource, DelegationTarget } from "@bernouy/cms-gateway/access/delegation";

export function registerDelegationCapabilities(dispatcher: ProviderCapabilityRegistry, gateway?: UlviaProviderGateway) {
    dispatcher.register("ulvia.cms.installations", "gateway.delegation.issue", async (input, context) => {
        if (!context.controlAuthority || !gateway?.delegations) {
            throw new ProviderCapabilityDispatchError("FORBIDDEN", 403);
        }
        return { delegation: await guarded(() => gateway.delegations!.issue(input.source as DelegationSource)) };
    });
    dispatcher.register("ulvia.cms.installations", "gateway.delegation.check", async (input, context) => {
        if (!context.controlAuthority || !gateway?.delegations) {
            throw new ProviderCapabilityDispatchError("FORBIDDEN", 403);
        }
        try {
            return await gateway.delegations.check(input.target as DelegationTarget);
        } catch (error) {
            if (error instanceof GatewayError && error.code === "not_authorized") {
                throw new ProviderCapabilityDispatchError("FORBIDDEN", 403);
            }
            throw error;
        }
    });
    dispatcher.register("ulvia.cms.installations", "gateway.delegation.close", async (input, context) => {
        if (!context.controlAuthority || !gateway?.delegations) {
            throw new ProviderCapabilityDispatchError("FORBIDDEN", 403);
        }
        await guarded(() =>
            gateway.delegations!.close(input.context as { siteId: string; ticket: string; requestId: string }),
        );
        return { accepted: true };
    });
}

async function guarded<T>(operation: () => Promise<T>): Promise<T> {
    try {
        return await operation();
    } catch (error) {
        if (error instanceof GatewayError && error.code === "not_authorized") {
            throw new ProviderCapabilityDispatchError("FORBIDDEN", 403);
        }
        throw error;
    }
}
