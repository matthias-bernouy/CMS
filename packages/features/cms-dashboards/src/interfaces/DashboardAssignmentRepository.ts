export type DashboardAssignment = {
    subjectId: string;
    dashboardId: string;
};

export interface DashboardAssignmentRepository {
    assign(assignment: DashboardAssignment): Promise<DashboardAssignment>;
    unassign(subjectId: string, dashboardId: string): Promise<boolean>;
    hasAssignment(subjectId: string, dashboardId: string): Promise<boolean>;
    getDashboardIdsForSubject(subjectId: string): Promise<string[]>;
    getSubjectIdsForDashboard(dashboardId: string): Promise<string[]>;
    getAssignedSubjectIds(dashboardId: string, subjectIds: readonly string[]): Promise<string[]>;
    countForDashboard(dashboardId: string): Promise<number>;
    deleteForSubject(subjectId: string): Promise<number>;
    deleteForDashboard(dashboardId: string): Promise<number>;
}
