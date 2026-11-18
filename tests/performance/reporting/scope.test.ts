import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { reportFixture } from "../fixtures/report";
import { assessmentReport } from "../assessment/report";
import { compareReports } from "./compare";
import { referenceEligibility } from "./archive/export";
import { selectedObligations, selectionFindings } from "./scope";
import { auditPlan, coverageMatrix } from "../capabilities/coverage";
import { renderReport } from "./html";
import { readRun } from "./history";

test("a selected report validates only its declared scope and retains ordinary full-plan omissions", async () => {
    const fixture = await reportFixture();
    const metadata = {
        ...fixture.metadata,
        selection: {
            kind: "selected-scenarios" as const,
            scenarioIds: fixture.scenarios.map((row) => row.id),
            plannedScenarios: 10,
        },
    };
    const required = selectedObligations(metadata, fixture.scenarios);
    expect(auditPlan(fixture.inventory, fixture.scenarios).some((row) => row.code === "missing-scenario")).toBe(true);
    expect(auditPlan(fixture.inventory, fixture.scenarios, required)).toEqual([]);
    const root = await mkdtemp(join(tmpdir(), "ulvia-selected-report-"));
    try {
        const { report } = await assessmentReport(
            root,
            metadata,
            fixture.inventory,
            fixture.scenarios,
            fixture.results,
            [],
        );
        expect(report.status).toBe("passed");
        expect(report.coverage).toHaveLength(1);
        expect(report.findings).toEqual([]);
        expect(renderReport(report)).toContain("not an exhaustive assessment");
        expect((await readRun(root, metadata.id)).metadata.selection).toEqual(metadata.selection);
        expect(referenceEligibility(report, true)).toBe(true);
        expect(compareReports(report, report).comparable).toBe(true);
        expect(compareReports({ ...report, metadata: fixture.metadata }, report).comparable).toBe(false);
        const otherScope = {
            ...report,
            metadata: { ...metadata, selection: { ...metadata.selection, scenarioIds: ["unknown"] } },
        };
        expect(compareReports(otherScope, otherScope).comparable).toBe(false);
        expect(referenceEligibility(otherScope, true)).toBe(false);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("invalid selection metadata cannot hide full coverage or make incomplete evidence healthy", async () => {
    const fixture = await reportFixture();
    const bad = { selection: { kind: "selected-scenarios" as const, scenarioIds: ["unknown"], plannedScenarios: 1 } };
    expect(selectionFindings(bad, fixture.scenarios)[0]?.code).toBe("invalid-selection");
    expect(selectedObligations(bad, fixture.scenarios)).toBeUndefined();
    const metadata = {
        ...fixture.metadata,
        selection: { ...bad.selection, scenarioIds: fixture.scenarios.map((row) => row.id) },
    };
    const rows = coverageMatrix(
        fixture.inventory,
        fixture.scenarios,
        [],
        selectedObligations(metadata, fixture.scenarios),
    );
    expect(rows.map((row) => row.status)).toEqual(["unattempted"]);
    const root = await mkdtemp(join(tmpdir(), "ulvia-missing-selected-"));
    try {
        const { report } = await assessmentReport(root, metadata, fixture.inventory, fixture.scenarios, [], []);
        expect(report.status).toBe("failed");
        expect(report.findings.some((row) => row.code === "scenario-not-passed")).toBe(true);
        expect(referenceEligibility(report, true)).toBe(false);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});

test("an explicitly requested unavailable reference still fails a selected assessment", async () => {
    const fixture = await reportFixture();
    const root = await mkdtemp(join(tmpdir(), "ulvia-selected-reference-"));
    try {
        const metadata = {
            ...fixture.metadata,
            selection: {
                kind: "selected-scenarios" as const,
                scenarioIds: fixture.scenarios.map((row) => row.id),
                plannedScenarios: 10,
            },
        };
        const { report } = await assessmentReport(
            root,
            metadata,
            fixture.inventory,
            fixture.scenarios,
            fixture.results,
            [],
            "20261117T120000Z-1234567-00000000",
        );
        expect(report.status).toBe("failed");
        expect(report.findings.some((row) => row.code === "invalid-reference")).toBe(true);
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
