/**
 * Filesystem adapter of @bernouy/cms-integrations — composition roots only.
 */

export {
    FsIntegrationDefinitionRepository,
    type FsIntegrationDefinitionRepositoryConfig,
    type FsIntegrationVersionLocation,
} from "../default-implementation/fs-definition/repository";
export {
    loadIntegrationDefinitionFromVersionRoot,
    type LoadIntegrationDefinitionFromVersionRootOptions,
} from "../default-implementation/fs-definition/definitionLoader";
export {
    FsIntegrationPackageResolver,
    type FsIntegrationPackageResolverConfig,
} from "../default-implementation/fs-definition/package-resolver";
export { resolveIntegrationDefinitionFile } from "../default-implementation/fs-definition/definition-bundle/resolver";
