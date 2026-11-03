export { assertRepositoryNamespace } from "cms-repository/repository/namespaces/validation";
export type {
    RepositoryConnectionCredential,
    RepositoryNamespaceCredential,
} from "cms-repository/repository/publication/transport/credentials";
export { RepositoryConnection } from "cms-repository/repository/publication/transport/connection";
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
