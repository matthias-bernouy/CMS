/**
 * @bernouy/cms-relations — declarative relation contracts and bounded runtime
 * helpers for source-backed relations.
 */
export type {
    CmsRelation,
    DashboardRelationProjection,
    LinkTableRelationBinding,
    ReferenceRelationBinding,
    RelationBinding,
    RelationBindingKind,
    RelationCardinality,
    RelationDashboardAction,
    RelationDashboardColumn,
    RelationEndpointRef,
    RelationPageContract,
    RelationSide,
} from "../interfaces/Relation";
export { RELATION_BINDING_KINDS, RELATION_CARDINALITIES } from "../interfaces/Relation";
export type { RelationRepository } from "../interfaces/RelationRepository";
export { InMemoryRelationRepository } from "../default-implementation/InMemoryRelationRepository";
export {
    DuplicateDashboardRelationProjectionError,
    DuplicateRelationError,
    RelationResolutionError,
    RelationValidationError,
} from "../core/errors";
export {
    dashboardRelationProjectionId,
    validateDashboardRelationProjection,
    validateRelation,
    validateRelationSources,
    sourceRepositoryRelationResolver,
    type RelationEndpointResolver,
} from "../core/validateRelation";
export {
    resolveRelationPage,
    type RelationPageRequest,
    type RelationPageResult,
    type RelationRuntimeDeps,
} from "../core/resolveRelationPage";
