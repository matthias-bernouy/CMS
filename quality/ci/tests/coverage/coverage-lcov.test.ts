import { describe, expect, test } from "bun:test";
import { parseLcov } from "../../coverage/ratchet";

describe("coverage LCOV parsing", () => {
    test("aggregates only implementation records from the selected package", () => {
        const coverage = parseLcov([
            "TN:",
            "SF:packages/features/example/src/index.ts",
            "FNF:2",
            "FNH:1",
            "LF:10",
            "LH:8",
            "end_of_record",
            "TN:",
            "SF:packages/features/example/tests/index.test.ts",
            "FNF:1",
            "FNH:1",
            "LF:5",
            "LH:5",
            "end_of_record",
            "TN:",
            "SF:packages/features/other/src/index.ts",
            "FNF:4",
            "FNH:4",
            "LF:20",
            "LH:20",
            "end_of_record",
        ].join("\n"), "packages/features/example");

        expect(coverage.coveredFiles).toEqual(new Set(["packages/features/example/src/index.ts"]));
        expect(coverage.functions).toEqual({ covered: 1, total: 2 });
        expect(coverage.lines).toEqual({ covered: 8, total: 10 });
    });
});
