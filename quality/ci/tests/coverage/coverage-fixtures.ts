import type { PackageCoverage } from "../../coverage/ratchet";

export const packageCoverage = (overrides: Partial<PackageCoverage> = {}): PackageCoverage => ({
    path: "packages/features/example",
    coveredSourceFiles: ["packages/features/example/src/covered.ts"],
    uncoveredSourceFiles: ["packages/features/example/src/uncovered.ts"],
    files: { covered: 1, total: 2 },
    functions: { covered: 8, total: 10 },
    lines: { covered: 80, total: 100 },
    ...overrides,
});
