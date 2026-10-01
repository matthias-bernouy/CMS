/**
 * Temporary dashboard assignment boundary retained while dashboards and views
 * are rebuilt on collection-owned contracts.
 */
export type {
    DashboardAssignment,
    DashboardAssignmentRepository,
} from "../interfaces/DashboardAssignmentRepository";
export { InMemoryDashboardAssignmentRepository } from "../default-implementation/InMemoryDashboardAssignmentRepository";
export type {
    DashboardRecord,
    DashboardNavigationItem,
    DashboardRepository,
} from "../interfaces/DashboardRepository";
export { dashboardNavigationViews, parseDashboardNavigation } from "../core/navigation";
export { InMemoryDashboardRepository } from "../default-implementation/InMemoryDashboardRepository";
