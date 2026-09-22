import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const repositoryRoot = resolve(import.meta.dir, "../../../..");

async function readRepositoryFile(path: string): Promise<string> {
    return readFile(resolve(repositoryRoot, path), "utf8");
}

async function readPackageManifest(path: string): Promise<Record<string, unknown>> {
    return JSON.parse(await readRepositoryFile(path)) as Record<string, unknown>;
}

test("the Bun runtime, types, CI, and container pins stay aligned", async () => {
    const version = (await readRepositoryFile(".bun-version")).trim();
    const rootPackage = await readPackageManifest("package.json");
    const componentsPackage = await readPackageManifest("packages/foundation/components/package.json");
    const controlPackage = await readPackageManifest("packages/surfaces/cms-control/package.json");
    const qualityWorkflow = await readRepositoryFile(".github/workflows/quality.yml");
    const integrationWorkflow = await readRepositoryFile(".github/workflows/quality-integration-contracts.yml");
    const setupAction = await readRepositoryFile(".github/actions/setup-workspace/action.yml");
    const dockerfile = await readRepositoryFile("infra/images/cms/Dockerfile");

    expect(Bun.version).toBe(version);
    expect(rootPackage.packageManager).toBe(`bun@${version}`);
    expect(rootPackage.engines).toEqual({ bun: version });

    const rootDevDependencies = rootPackage.devDependencies as Record<string, string>;
    const componentsDevDependencies = componentsPackage.devDependencies as Record<string, string>;
    const controlDevDependencies = controlPackage.devDependencies as Record<string, string>;
    expect(rootDevDependencies["@types/bun"]).toBe(version);
    expect(rootDevDependencies["bun-types"]).toBe(version);
    expect(componentsDevDependencies["@types/bun"]).toBe(version);
    expect(controlDevDependencies["@types/bun"]).toBe(version);

    expect(setupAction).toContain("bun-version-file: .bun-version");
    expect(qualityWorkflow).not.toContain("BUN_VERSION:");
    expect(integrationWorkflow).not.toContain("BUN_VERSION:");
    expect(dockerfile.match(new RegExp(`oven/bun:${version}-alpine@sha256:[0-9a-f]{64}`, "g"))).toHaveLength(2);
});
