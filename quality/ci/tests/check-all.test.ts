import { expect, test } from "bun:test";
import {
    ALL_CHECKS,
    formatCheckResults,
    runAllChecks,
    runChecks,
    type CheckDefinition,
    type CheckExecution,
} from "../check-all";

const checks: CheckDefinition[] = [
    { id: "first", label: "First check", args: ["run", "first"] },
    { id: "second", label: "Second check", args: ["run", "second"] },
    { id: "third", label: "Third check", args: ["run", "third"] },
];

test("check:all declares every fast workspace diagnostic in a stable order", () => {
    expect(ALL_CHECKS.map(({ id }) => id)).toEqual([
        "architecture",
        "integration-ownership",
        "repository-shape",
        "style",
        "typecheck",
        "architecture-tooling",
        "ci-tooling",
    ]);
    expect(ALL_CHECKS.map(({ args }) => args)).toEqual([
        ["run", "check:architecture"],
        ["run", "quality/integration-ownership/check.ts"],
        ["run", "check:repository-shape"],
        ["run", "check:style"],
        ["run", "typecheck"],
        ["x", "tsc", "--project", "quality/architecture/tsconfig.json"],
        ["x", "tsc", "--project", "quality/ci/tsconfig.json"],
    ]);
});

test("check:all runs every check after failures and preserves report order", async () => {
    const called: string[] = [];
    const execute = async (check: CheckDefinition): Promise<CheckExecution> => {
        called.push(check.id);
        return {
            exitCode: check.id === "second" ? 2 : 0,
            stdout: `${check.id} stdout\n`,
            stderr: check.id === "second" ? "second stderr\n" : "",
        };
    };
    const results = await runChecks(checks, execute);
    expect(called).toEqual(["first", "second", "third"]);
    expect(results.map(({ exitCode }) => exitCode)).toEqual([0, 2, 0]);

    const output = formatCheckResults(results);
    expect(output.indexOf("first stdout")).toBeLessThan(output.indexOf("second stdout"));
    expect(output.indexOf("second stdout")).toBeLessThan(output.indexOf("third stdout"));
    expect(output).toContain("[stderr]\nsecond stderr");
    expect(output).toEndWith("[check:all][SUMMARY] 2 passed, 1 failed");
});

test("check:all records executor errors and continues", async () => {
    const called: string[] = [];
    const results = await runChecks(checks, async (check) => {
        called.push(check.id);
        if (check.id === "second") {
            throw new Error("spawn failed");
        }
        return { exitCode: 0, stdout: "", stderr: "" };
    });
    expect(called).toEqual(["first", "second", "third"]);
    expect(results[1]).toMatchObject({ exitCode: 1, stderr: "spawn failed" });
});

test("check:all keeps advisory output successful and returns one for real failures", async () => {
    const reports: string[] = [];
    const advisory = async (): Promise<CheckExecution> => ({
        exitCode: 0,
        stdout: "[file-size][WARNING] cohesive.ts: 240 lines\n",
        stderr: "",
    });
    expect(await runAllChecks(checks, advisory, (output) => reports.push(output))).toBe(0);
    expect(reports[0]).toContain("[file-size][WARNING]");

    const failure = async (): Promise<CheckExecution> => ({ exitCode: 1, stdout: "", stderr: "type error" });
    expect(await runAllChecks(checks, failure, () => undefined)).toBe(1);
});
