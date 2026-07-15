/**
 * @bernouy/cms-dashboards — declarative dashboard contracts and repositories.
 * Integrations can install dashboards next to sources; surfaces render them.
 */
export type {
    Dashboard,
    DashboardAction,
    DashboardBinding,
    DashboardColumn,
    DashboardDataRef,
    DashboardDefinition,
    DashboardDto,
    DashboardEndpointRef,
    DashboardExpr,
    DashboardField,
    DashboardFilter,
    DashboardLookupCreate,
    DashboardLookupRef,
    DashboardMeta,
    DashboardOption,
    DashboardReorderableListItemField,
    DashboardSection,
    DashboardTableColumn,
    DashboardTableDerive,
    DashboardVisibilityRule,
    DashboardVisibilityCondition,
    DashboardVisibilityValue,
    DashboardWidget,
} from "../interfaces/Dashboard";
export type { DashboardRepository } from "../interfaces/DashboardRepository";
export { InMemoryDashboardRepository } from "../default-implementation/InMemoryDashboardRepository";
export { DuplicateDashboardError } from "../core/errors";
export {
    flattenDataShape,
    type FlattenedDataShapeField,
    type FlattenedInputType,
} from "../core/flattenDataShape";
export {
    validateDashboard,
    type ValidateDashboardOptions,
} from "../core/validateDashboard";
export {
    DASHBOARD_VISIBILITY_MAX_DEPTH,
    DASHBOARD_VISIBILITY_MAX_NODES,
    evaluateDashboardVisibility,
    isDashboardVisibilityExpression,
} from "../core/dashboardVisibility";
export {
    applyDashboardSourceOverlays,
} from "../core/sourceOverlayDashboard";
