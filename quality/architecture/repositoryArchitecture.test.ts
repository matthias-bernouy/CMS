import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { checkWorkspaceArchitecture, formatArchitectureViolations } from "./checkWorkspace";
import { repositoryArchitectureOptions } from "./repositoryPolicy";

test("repository respects the workspace architecture policy", async () => {
    const rootDir = resolve(import.meta.dir, "../..");
    const violations = await checkWorkspaceArchitecture(repositoryArchitectureOptions(rootDir));
    expect(formatArchitectureViolations(violations)).toBe("");
}, 15_000);
