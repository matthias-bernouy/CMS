import type { CheckDefinition } from "./types";
export const ALL_CHECKS: CheckDefinition[] = [
    { id: "architecture", label: "Workspace architecture", args: ["quality/architecture/check.ts"] },
    { id: "ui-contracts", label: "UI binding contracts", args: ["quality/ui-contracts/check.ts"] },
    { id: "logging", label: "Structured server logging", args: ["quality/logging/check.ts"] },
    { id: "repository-shape", label: "Repository shape guidance", args: ["quality/ci/repository-shape/check.ts"] },
    {
        id: "style",
        label: "Code style",
        args: ["node_modules/@biomejs/biome/bin/biome", "check", "--reporter=concise", "--max-diagnostics=none", "."],
    },
    { id: "typecheck", label: "Workspace typecheck", args: ["node_modules/.bin/tsc", "--build"] },
    { id: "dead-code", label: "Dead code", args: ["quality/dead-code/check.ts"] },
    {
        id: "architecture-tooling",
        label: "Architecture tooling typecheck",
        args: ["node_modules/.bin/tsc", "--project", "quality/architecture/tsconfig.json"],
    },
    {
        id: "dead-code-tooling",
        label: "Dead-code tooling typecheck",
        args: ["node_modules/.bin/tsc", "--project", "quality/dead-code/tsconfig.json"],
    },
    {
        id: "ci-tooling",
        label: "CI tooling typecheck",
        args: ["node_modules/.bin/tsc", "--project", "quality/ci/tsconfig.json"],
    },
];
