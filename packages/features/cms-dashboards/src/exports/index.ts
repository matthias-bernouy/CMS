/**
 * @bernouy/cms-dashboards — declarative dashboard contracts and repositories.
 * Integrations can install dashboards next to sources; surfaces render them.
 */
export type {
    Dashboard,
    DashboardDto,
    DashboardMeta,
    Collection,
    CollectionEndpointRef,
    CollectionItemEndpoints,
    CollectionListEndpointRef,
    ParamExpr,
    DashboardWidget,
    RowAction,
    ColumnSpec,
    ColumnFormat,
    FieldSpec,
    FieldInput,
    FilterSpec,
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
