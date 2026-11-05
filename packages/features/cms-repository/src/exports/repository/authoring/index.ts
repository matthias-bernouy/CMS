export {
    CollectionAuthoring,
    CollectionPreparationError,
    CollectionPublicationRecoveryError,
    type CollectionPublisher,
    type RepositoryConnectionStatus,
} from "cms-repository/repository/authoring/CollectionAuthoring";
export { parseSourceSnapshot, type SourceAsset } from "cms-repository/repository/authoring/snapshot";

export {
    NamespaceAccessError,
    type NamespaceAccess,
    type NamespaceInventoryQuery,
    type NamespaceInventoryPage,
} from "cms-repository/repository/authoring/namespaces";

export { scanJsonSourceTree, type SourceFile } from "cms-repository/repository/authoring/sourceTree";

export { RepositoryAuthoring } from "cms-repository/repository/authoring/resources/RepositoryAuthoring";
export { AuthoringDependencyError } from "cms-repository/repository/authoring/resources/dependencies/transport";
