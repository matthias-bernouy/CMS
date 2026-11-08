import type { RepositoryActor } from "@bernouy/cms-repository/features/repository";
import type { UlviaProviderGateway } from "../../../ports/index";
import { ProviderCapabilityDispatchError } from "../../../dispatch/registry";

/** Resolve an authenticated Provider alias; application input never chooses the account. */
export function repositoryAccountResolver(gateway: Pick<UlviaProviderGateway, "identities">) {
    return async (context: RepositoryActor): Promise<string> => {
        if (!context.subjectId) {
            throw new ProviderCapabilityDispatchError("ACTOR_UNAVAILABLE", 403);
        }
        const accountId = await gateway.identities.resolve({ providerId: context.providerId }, context.subjectId);
        if (!accountId) {
            throw new ProviderCapabilityDispatchError("ACTOR_UNAVAILABLE", 403);
        }
        return accountId;
    };
}
