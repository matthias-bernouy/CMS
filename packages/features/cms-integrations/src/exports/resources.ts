export type { CollectionIntegrationDefinition } from "../interfaces/Integration";
export {
    integrationRuntimeDependencies,
    type IntegrationRuntimeDependency,
} from "../core/definitions/runtimeDependencies";
export type {
    CollectionBlocResource,
    CollectionEndpointRequirement,
    CollectionRequirement,
    CollectionResource,
    CollectionResourceCategory,
    CollectionResourceRequirements,
    CollectionSelection,
} from "../interfaces/IntegrationResources";
export { collectionSelectableResources } from "../core/resources/selection";
export { resolveCollectionDependencies } from "../core/resources/dependencySelection";
