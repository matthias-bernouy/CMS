import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { checkWorkspaceArchitecture, formatArchitectureViolations } from "../core/checkWorkspace";
import { repositoryArchitectureOptions } from "../repository/repositoryPolicy";

test("repository respects the workspace architecture policy", async () => {
    const rootDir = resolve(import.meta.dir, "../../..");
    const violations = await checkWorkspaceArchitecture(repositoryArchitectureOptions(rootDir));
    expect(formatArchitectureViolations(violations)).toBe("");
}, 15_000);
