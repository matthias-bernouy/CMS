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
export { RepositoryNamespaceEndpoint } from "cms-repository/repository/namespaces/http";
export { repositoryWriteHeaders } from "cms-repository/repository/namespaces/request";
export type {
    RepositoryOwnerCredential,
    RepositoryWriteCredential,
} from "cms-repository/repository/namespaces/request";
export { RepositoryNamespaceClient } from "cms-repository/repository/namespaces/client";
