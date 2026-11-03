import { readdir } from "node:fs/promises";
import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { checkWorkspaceArchitecture, formatArchitectureViolations } from "../core/checkWorkspace";
import { repositoryArchitectureOptions } from "../repository/repositoryPolicy";

test("repository respects the workspace architecture policy", async () => {
    const rootDir = resolve(import.meta.dir, "../../..");
    const violations = await checkWorkspaceArchitecture(repositoryArchitectureOptions(rootDir));
    expect(formatArchitectureViolations(violations)).toBe("");
}, 15_000);

test("embedding backends are production dependencies only of runtimes that execute inference", async () => {
    const root = resolve(import.meta.dir, "../../..");
    const manifests = new Map<string, { dependencies?: Record<string, string> }>();
    for (const layer of ["foundation", "features", "surfaces", "runtimes"]) {
        const directory = resolve(root, "packages", layer);
        for (const entry of await readdir(directory, { withFileTypes: true })) {
            if (!entry.isDirectory()) {
                continue;
            }
            const path = resolve(directory, entry.name, "package.json");
            if (await Bun.file(path).exists()) {
                const manifest = await Bun.file(path).json();
                manifests.set(manifest.name, manifest);
            }
        }
    }
    const reachesBackend = (start: string) => {
        const pending = [start];
        const seen = new Set<string>();
        while (pending.length) {
            const name = pending.pop()!;
            if (name === "@huggingface/transformers") {
                return true;
            }
            if (!seen.has(name)) {
                seen.add(name);
                pending.push(...Object.keys(manifests.get(name)?.dependencies ?? {}));
            }
        }
        return false;
    };
    for (const name of [
        "@bernouy/text-search",
        "@bernouy/cms-documentation",
        "@bernouy/cms-repository",
        "@bernouy/cms-edge-server",
        "@bernouy/ulvia-cli",
    ]) {
        expect(manifests.has(name)).toBe(true);
        expect(reachesBackend(name)).toBe(false);
    }
    expect(reachesBackend("@bernouy/ulvia-provider-server")).toBe(true);
    expect(reachesBackend("@bernouy/official-repository-server")).toBe(true);
});
