import { join } from "node:path";
import type { DashboardAssignment, DashboardAssignmentRepository } from "@bernouy/cms-dashboards";
import { readJsonArray, writeJsonArray } from "./jsonFile";

const ASSIGNMENTS_FILE = ".p9r/generated/dashboard-assignments.json";

export class LocalFsDashboardAssignmentRepository implements DashboardAssignmentRepository {
    private readonly file: string;

    constructor(siteDir: string) {
        this.file = join(siteDir, ASSIGNMENTS_FILE);
    }

    async assign(assignment: DashboardAssignment): Promise<DashboardAssignment> {
        const assignments = await this.readAll();
        if (!assignments.some((item) => same(item, assignment))) {
            assignments.push(structuredClone(assignment));
            await writeJsonArray(this.file, assignments);
        }
        return structuredClone(assignment);
    }

    async unassign(subjectId: string, dashboardId: string): Promise<boolean> {
        const assignments = await this.readAll();
        const next = assignments.filter((item) => item.subjectId !== subjectId || item.dashboardId !== dashboardId);
        if (next.length === assignments.length) {
            return false;
        }
        await writeJsonArray(this.file, next);
        return true;
    }

    async hasAssignment(subjectId: string, dashboardId: string): Promise<boolean> {
        return (await this.readAll()).some((item) => item.subjectId === subjectId && item.dashboardId === dashboardId);
    }

    async getDashboardIdsForSubject(subjectId: string): Promise<string[]> {
        return (await this.readAll())
            .filter((item) => item.subjectId === subjectId)
            .map((item) => item.dashboardId)
            .sort();
    }

    async getSubjectIdsForDashboard(dashboardId: string): Promise<string[]> {
        return (await this.readAll())
            .filter((item) => item.dashboardId === dashboardId)
            .map((item) => item.subjectId)
            .sort();
    }

    async getAssignedSubjectIds(dashboardId: string, subjectIds: readonly string[]): Promise<string[]> {
        const requested = new Set(subjectIds);
        return (await this.readAll())
            .filter((item) => item.dashboardId === dashboardId && requested.has(item.subjectId))
            .map((item) => item.subjectId)
            .sort();
    }

    async countForDashboard(dashboardId: string): Promise<number> {
        return (await this.readAll()).filter((item) => item.dashboardId === dashboardId).length;
    }

    async deleteForSubject(subjectId: string): Promise<number> {
        const assignments = await this.readAll();
        const next = assignments.filter((item) => item.subjectId !== subjectId);
        await writeJsonArray(this.file, next);
        return assignments.length - next.length;
    }

    async deleteForDashboard(dashboardId: string): Promise<number> {
        const assignments = await this.readAll();
        const next = assignments.filter((item) => item.dashboardId !== dashboardId);
        await writeJsonArray(this.file, next);
        return assignments.length - next.length;
    }

    private async readAll(): Promise<DashboardAssignment[]> {
        return (await readJsonArray(this.file)).filter(isAssignment).map((assignment) => structuredClone(assignment));
    }
}

function same(left: DashboardAssignment, right: DashboardAssignment): boolean {
    return left.subjectId === right.subjectId && left.dashboardId === right.dashboardId;
}

function isAssignment(value: unknown): value is DashboardAssignment {
    const assignment = value as Partial<DashboardAssignment> | null;
    return Boolean(
        assignment && typeof assignment.subjectId === "string" && typeof assignment.dashboardId === "string",
    );
}
