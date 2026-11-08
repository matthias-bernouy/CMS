export { assertRepositoryNamespace } from "repository/repository/namespaces/validation";
export type {
    RepositoryConnectionCredential,
    RepositoryNamespaceCredential,
} from "repository/repository/publication/transport/credentials";
export { RepositoryConnection } from "repository/repository/publication/transport/connection";
export { RepositoryNamespaceClient } from "repository/repository/namespaces/transport/client";
export { RepositoryNamespaces } from "repository/repository/namespaces/accounts/RepositoryNamespaces";
export { MAX_ACCOUNT_NAMESPACES } from "repository/repository/namespaces/accounts/validation";
export type {
    RepositoryOwnedNamespace,
    RepositoryNamespaceView,
    RepositoryNamespaceAccounts,
    RepositoryNamespaceOwnershipStore,
    RepositoryNamespaceLocks,
} from "repository/repository/namespaces/accounts/interfaces";
