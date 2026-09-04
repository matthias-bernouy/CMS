import type { Collection, Db } from "mongodb";
import type { DashboardAssignment, DashboardAssignmentRepository } from "../interfaces/DashboardAssignmentRepository";

export type MongoDashboardAssignmentRepositoryConfig = {
    collectionPrefix?: string;
};

export class MongoDashboardAssignmentRepository implements DashboardAssignmentRepository {
    private readonly prefix: string;

    constructor(
        private readonly db: Db,
        config: MongoDashboardAssignmentRepositoryConfig = {},
    ) {
        this.prefix = config.collectionPrefix ?? "";
    }

    async init(): Promise<void> {
        await Promise.all([
            this.assignments.createIndex({ subjectId: 1, dashboardId: 1 }, { unique: true }),
            this.assignments.createIndex({ dashboardId: 1 }),
        ]);
    }

    async assign(assignment: DashboardAssignment): Promise<DashboardAssignment> {
        await this.assignments.updateOne(assignment, { $setOnInsert: assignment }, { upsert: true });
        return structuredClone(assignment);
    }

    async unassign(subjectId: string, dashboardId: string): Promise<boolean> {
        return (await this.assignments.deleteOne({ subjectId, dashboardId })).deletedCount > 0;
    }

    async hasAssignment(subjectId: string, dashboardId: string): Promise<boolean> {
        return (await this.assignments.countDocuments({ subjectId, dashboardId }, { limit: 1 })) > 0;
    }

    async getDashboardIdsForSubject(subjectId: string): Promise<string[]> {
        return (await this.assignments.find({ subjectId }).sort({ dashboardId: 1 }).toArray()).map(
            (assignment) => assignment.dashboardId,
        );
    }

    async getSubjectIdsForDashboard(dashboardId: string): Promise<string[]> {
        return (await this.assignments.find({ dashboardId }).sort({ subjectId: 1 }).toArray()).map(
            (assignment) => assignment.subjectId,
        );
    }

    async getAssignedSubjectIds(dashboardId: string, subjectIds: readonly string[]): Promise<string[]> {
        if (!subjectIds.length) {
            return [];
        }
        return (
            await this.assignments
                .find({ dashboardId, subjectId: { $in: [...subjectIds] } })
                .sort({ subjectId: 1 })
                .toArray()
        ).map((assignment) => assignment.subjectId);
    }

    async countForDashboard(dashboardId: string): Promise<number> {
        return await this.assignments.countDocuments({ dashboardId });
    }

    async deleteForSubject(subjectId: string): Promise<number> {
        return (await this.assignments.deleteMany({ subjectId })).deletedCount;
    }

    async deleteForDashboard(dashboardId: string): Promise<number> {
        return (await this.assignments.deleteMany({ dashboardId })).deletedCount;
    }

    private get assignments(): Collection<DashboardAssignment> {
        return this.db.collection<DashboardAssignment>(this.prefix + "dashboardAssignments");
    }
}
