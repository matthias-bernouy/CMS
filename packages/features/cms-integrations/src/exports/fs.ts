/**
 * Filesystem adapter of @bernouy/cms-integrations — composition roots only.
 */

export {
    FsIntegrationDefinitionRepository,
    type FsIntegrationDefinitionRepositoryConfig,
} from "../default-implementation/fs-definition/repository";
export { resolveIntegrationDefinitionFile } from "../default-implementation/fs-definition/definition-bundle/resolver";
