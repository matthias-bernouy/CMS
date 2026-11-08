export {
    CollectionAuthoring,
    CollectionPreparationError,
    CollectionPublicationRecoveryError,
    type CollectionPublisher,
    type RepositoryConnectionStatus,
} from "repository/repository/authoring/CollectionAuthoring";
export { parseSourceSnapshot, type SourceAsset } from "repository/repository/authoring/snapshot";

export {
    NamespaceAccessError,
    type NamespaceAccess,
    type NamespaceInventoryQuery,
    type NamespaceInventoryPage,
} from "repository/repository/authoring/namespaces";

export { scanJsonSourceTree, type SourceFile } from "repository/repository/authoring/sourceTree";

export { RepositoryAuthoring } from "repository/repository/authoring/resources/RepositoryAuthoring";
export { AuthoringDependencyError } from "repository/repository/authoring/resources/dependencies/transport";
