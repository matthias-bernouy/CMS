import type { RepositoryCapabilityPorts } from "./interfaces";
import type {
    NamespaceClaimInput,
    NamespaceTransferInput,
    NamespaceSuspendInput,
} from "repository/application/registry/interfaces/inputs";
import { repositoryAccount } from "./account";

export function repositoryNamespaces({ namespaces }: RepositoryCapabilityPorts) {
    return Object.freeze({
        async list(accountId?: string) {
            return { namespaces: await namespaces.listOwned(repositoryAccount(accountId)) };
        },
        async claim(input: NamespaceClaimInput, accountId?: string) {
            return namespaces.claim(repositoryAccount(accountId), input.namespace);
        },
        async transfer(input: NamespaceTransferInput, accountId?: string) {
            return namespaces.transfer(
                repositoryAccount(accountId),
                input.namespace,
                input.namespaceRevision,
                input.targetAccountId,
            );
        },
        async suspend(input: NamespaceSuspendInput, accountId?: string) {
            return namespaces.suspend(repositoryAccount(accountId), input.namespace, input.namespaceRevision);
        },
    });
}
