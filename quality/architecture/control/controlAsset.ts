import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { prepareControlAssetWorkspace, runControlAssetRecipes } from "./controlAssetWorkspace";

export const CONTROL_COMPONENT_ENTRY = "packages/surfaces/cms-control/src/components/index.ts";
export const CONTROL_COMPONENT_ASSET = "packages/surfaces/cms-control/src/static/assets/control-components.js";

export async function generateControlComponentAsset(rootDir: string): Promise<string> {
    const process = Bun.spawn([Bun.argv[0]!, resolve(import.meta.dir, "generateControlAsset.ts"), resolve(rootDir)], {
        stdout: "pipe",
        stderr: "pipe",
    });
    const [exitCode, stdout, stderr] = await Promise.all([
        process.exited,
        new Response(process.stdout).text(),
        new Response(process.stderr).text(),
    ]);
    if (exitCode !== 0) {
        throw new Error(`Isolated Control asset build failed:\n${stderr.trim()}`);
    }
    return stdout;
}

export async function generateControlComponentAssetInProcess(rootDir: string): Promise<string> {
    const temporaryRoot = await mkdtemp(join(tmpdir(), "cmscore-control-asset-"));
    const temporaryComponents = join(temporaryRoot, "packages/foundation/components");
    const temporaryControl = join(temporaryRoot, "packages/surfaces/cms-control");

    try {
        await prepareControlAssetWorkspace(rootDir, temporaryRoot, temporaryComponents, temporaryControl);
        await runControlAssetRecipes(temporaryComponents, temporaryControl);
        return await readFile(join(temporaryRoot, CONTROL_COMPONENT_ASSET), "utf8");
    } finally {
        await rm(temporaryRoot, { recursive: true, force: true });
    }
}

export function normalizeControlAsset(contents: string): string {
    return contents.replace(/^(\s*\/\/ )(.+)$/gm, (_line, prefix: string, rawPath: string) => {
        const path = rawPath.replaceAll("\\", "/");
        const nodeModulesMarker = path.lastIndexOf("/node_modules/");
        if (nodeModulesMarker >= 0) {
            return `${prefix}${path.slice(nodeModulesMarker + 1)}`;
        }
        const relativeNodeModules = /^(?:\.\.\/)+node_modules\//.exec(path);
        if (relativeNodeModules) {
            return `${prefix}${path.slice(relativeNodeModules[0].length - "node_modules/".length)}`;
        }
        const packagesMarker = path.lastIndexOf("/packages/");
        const repositoryPath = packagesMarker >= 0 ? path.slice(packagesMarker + 1) : path;
        const controlPrefix = "packages/surfaces/cms-control/";
        if (repositoryPath.startsWith(controlPrefix)) {
            return `${prefix}${repositoryPath.slice(controlPrefix.length)}`;
        }
        const workspaceMatch = repositoryPath.match(
            /^packages\/(foundation|features|resources|surfaces|runtimes)\/(.+)$/,
        );
        if (workspaceMatch) {
            return `${prefix}../../${workspaceMatch[1]}/${workspaceMatch[2]}`;
        }
        return `${prefix}${path}`;
    });
}
