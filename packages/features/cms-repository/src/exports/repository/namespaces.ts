export type {
    NamespaceProof,
    RepositoryNamespace,
    RepositoryNamespaceStore,
} from "cms-repository/repository/namespaces/interfaces";
export { RepositoryNamespaceAuthority } from "cms-repository/repository/namespaces/authority";
export {
    assertRepositoryNamespace,
    namespacePublicKey,
    parseNamespaceProof,
    repositoryDigest,
    signNamespaceProof,
    verifyNamespaceProof,
} from "cms-repository/repository/namespaces/proofs";
export { RepositoryNamespaceEndpoint } from "cms-repository/repository/namespaces/transport/http";
export { repositoryWriteHeaders } from "cms-repository/repository/namespaces/transport/request";
export type { RepositoryOwnerCredential } from "cms-repository/repository/namespaces/transport/request";
export { RepositoryNamespaceClient } from "cms-repository/repository/namespaces/transport/client";
export { RepositoryNamespaces } from "cms-repository/repository/namespaces/accounts/RepositoryNamespaces";
export { MAX_ACCOUNT_NAMESPACES } from "cms-repository/repository/namespaces/accounts/validation";
export type {
    RepositoryOwnedNamespace,
    RepositoryNamespaceView,
    RepositoryNamespaceAccounts,
    RepositoryNamespaceOwnershipStore,
    RepositoryNamespaceLocks,
} from "cms-repository/repository/namespaces/accounts/interfaces";
