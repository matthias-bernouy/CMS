import { expect, test } from "bun:test";
import { reportFixture } from "../fixtures/report";
import { compareReports } from "./compare";

test("failed business postconditions or cleanup cannot become comparable success from valid raw timings", async () => {
    const complete = await reportFixture();
    expect(compareReports(complete, complete).comparable).toBe(true);
    for (const status of ["failed", "blocked"] as const) {
        const incomplete = {
            ...complete,
            results: complete.results.map((result) => ({
                ...result,
                status,
                failure: status === "failed" ? "Business postcondition failed" : "Fixture cleanup failed",
            })),
        };
        const before = JSON.stringify(incomplete);
        for (const comparison of [compareReports(incomplete, complete), compareReports(complete, incomplete)]) {
            expect(comparison.comparable).toBe(false);
            expect(comparison.changes).toEqual([]);
            expect(comparison.findings.some((row) => row.code === "incomplete-comparison")).toBe(true);
        }
        expect(JSON.stringify(incomplete)).toBe(before);
        expect(incomplete.results[0]!.measurements[0]!.validated).toBe(true);
    }
});
