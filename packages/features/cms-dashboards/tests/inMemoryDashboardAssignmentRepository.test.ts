import { describe, expect, test } from "bun:test";

import { InMemoryDashboardAssignmentRepository } from "@bernouy/cms-dashboards";

describe("InMemoryDashboardAssignmentRepository", () => {
    test("keeps idempotent assignments and clears dashboards or subjects", async () => {
        const repo = new InMemoryDashboardAssignmentRepository();
        await repo.assign({ subjectId: "support-1", dashboardId: "support" });
        await repo.assign({ subjectId: "support-1", dashboardId: "support" });
        await repo.assign({ subjectId: "support-1", dashboardId: "operations" });
        await repo.assign({ subjectId: "support-2", dashboardId: "support" });

        expect(await repo.getDashboardIdsForSubject("support-1")).toEqual(["operations", "support"]);
        expect(await repo.getSubjectIdsForDashboard("support")).toEqual(["support-1", "support-2"]);
        expect(await repo.getAssignedSubjectIds("support", ["missing", "support-2"])).toEqual(["support-2"]);
        expect(await repo.countForDashboard("support")).toBe(2);
        expect(await repo.deleteForSubject("support-1")).toBe(2);
        expect(await repo.deleteForDashboard("support")).toBe(1);
        expect(await repo.hasAssignment("support-2", "support")).toBe(false);
    });
});
