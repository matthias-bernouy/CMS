/**
 * @bernouy/cms-dashboards — declarative dashboard contracts and repositories.
 * Integrations can install dashboards next to sources; surfaces render them.
 */
export type {
    Dashboard,
    DashboardAction,
    DashboardBinding,
    DashboardColumn,
    ComposedDashboard,
    DashboardDataRef,
    DashboardDetailMainItem,
    DashboardDefinition,
    DashboardDto,
    DashboardExecutionPlan,
    DashboardEmbeddedLookupRef,
    DashboardEndpointRef,
    DashboardExpr,
    DashboardField,
    DashboardFieldBase,
    DashboardFieldExpression,
    DashboardFilter,
    DashboardLookupCreate,
    DashboardLookupPresentation,
    DashboardLookupRef,
    DashboardMeta,
    DashboardNavigationListWidget,
    DashboardOption,
    DashboardReorderableListItemField,
    DashboardResourceExpression,
    DashboardSchemaExclusion,
    DashboardSection,
    DashboardTableColumn,
    DashboardTableDerive,
    DashboardVisibilityRule,
    DashboardVisibilityCondition,
    DashboardVisibilityValue,
    DashboardWidget,
    DashboardAllowedCall,
    DashboardOrigin,
    DashboardViewAvailability,
    DashboardViewDefinition,
    DashboardViewMount,
    DashboardViewNode,
    DashboardViewOrigin,
    LegacyDashboardDefinition,
    ResolvedDashboard,
    ResolvedDashboardView,
} from "../interfaces/Dashboard";
export {
    DASHBOARD_MAX_VIEW_DEPTH,
    DASHBOARD_MAX_NESTED_FIELDS,
    DASHBOARD_MAX_OPTIONS,
    DASHBOARD_SCHEMA_VERSION,
} from "../interfaces/Dashboard";
export type { DashboardRepository } from "../interfaces/DashboardRepository";
export type { DashboardViewRepository } from "../interfaces/DashboardViewRepository";
export type {
    DashboardAssignment,
    DashboardAssignmentRepository,
} from "../interfaces/DashboardAssignmentRepository";
export { InMemoryDashboardRepository } from "../default-implementation/InMemoryDashboardRepository";
export { InMemoryDashboardViewRepository } from "../default-implementation/InMemoryDashboardViewRepository";
export { InMemoryDashboardAssignmentRepository } from "../default-implementation/InMemoryDashboardAssignmentRepository";
export { DuplicateDashboardError, DuplicateDashboardViewError } from "../core/errors";
export {
    flattenDataShape,
    type FlattenedDataShapeField,
    type FlattenedInputType,
} from "../core/flattenDataShape";
export {
    compileDashboardExecutionPlan,
    dashboardViewAsLegacyDashboard,
    normalizeLegacyDashboardView,
    resolveDashboardViews,
    validateDashboard,
    validateDashboardStructure,
    validateDashboardViewStructure,
    type ValidateDashboardOptions,
} from "../core/validateDashboard";
export {
    DASHBOARD_VISIBILITY_MAX_DEPTH,
    DASHBOARD_VISIBILITY_MAX_NODES,
    evaluateDashboardVisibility,
    isDashboardVisibilityExpression,
} from "../core/dashboardVisibility";
export {
    dashboardPathSegments,
    dashboardSecretRefPaths,
    dashboardReferenceFieldPaths,
    isSafeDashboardExpression,
    isSafeDashboardPath,
} from "../core/dashboardPaths";
export { applyDashboardSourceOverlays } from "../core/sourceOverlayDashboard";
