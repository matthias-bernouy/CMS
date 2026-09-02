import type { DashboardAssignment, DashboardAssignmentRepository } from "../interfaces/DashboardAssignmentRepository";

export class InMemoryDashboardAssignmentRepository implements DashboardAssignmentRepository {
    private readonly dashboardIdsBySubject = new Map<string, Set<string>>();

    async assign(assignment: DashboardAssignment): Promise<DashboardAssignment> {
        const dashboardIds = this.dashboardIdsBySubject.get(assignment.subjectId) ?? new Set<string>();
        dashboardIds.add(assignment.dashboardId);
        this.dashboardIdsBySubject.set(assignment.subjectId, dashboardIds);
        return structuredClone(assignment);
    }

    async unassign(subjectId: string, dashboardId: string): Promise<boolean> {
        const dashboardIds = this.dashboardIdsBySubject.get(subjectId);
        const deleted = dashboardIds?.delete(dashboardId) ?? false;
        if (dashboardIds?.size === 0) {
            this.dashboardIdsBySubject.delete(subjectId);
        }
        return deleted;
    }

    async hasAssignment(subjectId: string, dashboardId: string): Promise<boolean> {
        return this.dashboardIdsBySubject.get(subjectId)?.has(dashboardId) ?? false;
    }

    async getDashboardIdsForSubject(subjectId: string): Promise<string[]> {
        return [...(this.dashboardIdsBySubject.get(subjectId) ?? [])].sort();
    }

    async getSubjectIdsForDashboard(dashboardId: string): Promise<string[]> {
        return [...this.dashboardIdsBySubject]
            .filter(([, dashboardIds]) => dashboardIds.has(dashboardId))
            .map(([subjectId]) => subjectId)
            .sort();
    }

    async getAssignedSubjectIds(dashboardId: string, subjectIds: readonly string[]): Promise<string[]> {
        return subjectIds.filter((subjectId) => this.dashboardIdsBySubject.get(subjectId)?.has(dashboardId)).sort();
    }

    async countForDashboard(dashboardId: string): Promise<number> {
        return (await this.getSubjectIdsForDashboard(dashboardId)).length;
    }

    async deleteForSubject(subjectId: string): Promise<number> {
        const deleted = this.dashboardIdsBySubject.get(subjectId)?.size ?? 0;
        this.dashboardIdsBySubject.delete(subjectId);
        return deleted;
    }

    async deleteForDashboard(dashboardId: string): Promise<number> {
        let deleted = 0;
        for (const [subjectId, dashboardIds] of this.dashboardIdsBySubject) {
            if (dashboardIds.delete(dashboardId)) {
                deleted += 1;
            }
            if (dashboardIds.size === 0) {
                this.dashboardIdsBySubject.delete(subjectId);
            }
        }
        return deleted;
    }
}
