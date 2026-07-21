import { resolve } from "node:path";
import { checkWorkspaceArchitecture, formatArchitectureViolations } from "./core/checkWorkspace";
import { repositoryArchitectureOptions } from "./repository/repositoryPolicy";

export async function checkRepositoryArchitecture(rootDir: string): Promise<void> {
    const violations = await checkWorkspaceArchitecture(repositoryArchitectureOptions(rootDir));
    if (violations.length === 0) return;
    throw new Error(`Workspace architecture check failed:\n${formatArchitectureViolations(violations)}`);
}

if (import.meta.main) {
    await checkRepositoryArchitecture(resolve(import.meta.dir, "../.."));
    console.log("Workspace architecture check passed.");
}
