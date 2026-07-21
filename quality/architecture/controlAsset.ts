import { cp, mkdir, mkdtemp, readFile, readdir, rm, symlink } from "node:fs/promises";
import { join, relative, resolve } from "node:path";
import { tmpdir } from "node:os";

export const CONTROL_COMPONENT_ENTRY = "packages/surfaces/cms-control/src/components/index.ts";
export const CONTROL_COMPONENT_ASSET = "packages/surfaces/cms-control/src/static/assets/control-components.js";

/**
 * Runs the real component and Control asset recipes in a disposable workspace. The build is
 * isolated because both upstream scripts intentionally write into their package directories.
 */
export async function generateControlComponentAsset(rootDir: string): Promise<string> {
    const process = Bun.spawn([
        Bun.argv[0]!,
        resolve(import.meta.dir, "generateControlAsset.ts"),
        resolve(rootDir),
    ], {
        stdout: "pipe",
        stderr: "pipe",
    });
    const [exitCode, stdout, stderr] = await Promise.all([
        process.exited,
        new Response(process.stdout).text(),
        new Response(process.stderr).text(),
    ]);
    if (exitCode !== 0) throw new Error(`Isolated Control asset build failed:\n${stderr.trim()}`);
    return stdout;
}

export async function generateControlComponentAssetInProcess(rootDir: string): Promise<string> {
    const temporaryRoot = await mkdtemp(join(tmpdir(), "cmscore-control-asset-"));
    const temporaryComponents = join(temporaryRoot, "packages/foundation/components");
    const temporaryControl = join(temporaryRoot, "packages/surfaces/cms-control");

    try {
        await Promise.all([
            copyWorkspaceTree(resolve(rootDir, "packages/foundation"), join(temporaryRoot, "packages/foundation")),
            copyWorkspaceTree(resolve(rootDir, "packages/features"), join(temporaryRoot, "packages/features")),
            copyWorkspaceTree(
                resolve(rootDir, "packages/surfaces/cms-control"),
                join(temporaryRoot, "packages/surfaces/cms-control"),
            ),
            cp(resolve(rootDir, "tsconfig.base.json"), join(temporaryRoot, "tsconfig.base.json")),
        ]);
        await linkInstalledDependencies(rootDir, temporaryRoot, temporaryComponents, temporaryControl);

        await runBunRecipe(["run", "build"], temporaryComponents, "@bernouy/components build recipe");
        await runBunRecipe([
            resolve(import.meta.dir, "runControlPrebuild.ts"),
            join(temporaryControl, "src/prebuildControl.ts"),
        ], temporaryControl, "@bernouy/cms-control prebuild recipe");

        return await readFile(join(temporaryRoot, CONTROL_COMPONENT_ASSET), "utf8");
    } finally {
        await rm(temporaryRoot, { recursive: true, force: true });
    }
}

export function normalizeControlAsset(contents: string): string {
    return contents.replace(/^(\s*\/\/ )(.+)$/gm, (_line, prefix: string, rawPath: string) => {
        const path = rawPath.replaceAll("\\", "/");
        const packagesMarker = path.lastIndexOf("/packages/");
        const repositoryPath = packagesMarker >= 0 ? path.slice(packagesMarker + 1) : path;
        const controlPrefix = "packages/surfaces/cms-control/";
        if (repositoryPath.startsWith(controlPrefix)) return `${prefix}${repositoryPath.slice(controlPrefix.length)}`;
        const workspaceMatch = repositoryPath.match(/^packages\/(foundation|features|resources|surfaces|runtimes)\/(.+)$/);
        if (workspaceMatch) return `${prefix}../../${workspaceMatch[1]}/${workspaceMatch[2]}`;
        return `${prefix}${path}`;
    });
}

async function copyWorkspaceTree(sourceRoot: string, targetRoot: string): Promise<void> {
    await mkdir(targetRoot, { recursive: true });
    await cp(sourceRoot, targetRoot, {
        recursive: true,
        filter(source) {
            const path = relative(sourceRoot, source).replaceAll("\\", "/");
            const segments = path.split("/");
            return !segments.includes("dist") && !segments.includes("node_modules");
        },
    });
}

async function linkInstalledDependencies(
    rootDir: string,
    temporaryRoot: string,
    temporaryComponents: string,
    temporaryControl: string,
): Promise<void> {
    const overrides = await temporaryWorkspacePackages(temporaryRoot);
    overrides.set("@bernouy/components", temporaryComponents);
    overrides.set("@bernouy/cms-control", temporaryControl);
    const mirrors: Array<Promise<void>> = [
        mirrorNodeModules(resolve(rootDir, "node_modules"), join(temporaryRoot, "node_modules"), overrides),
    ];
    for (const layer of ["foundation", "features"]) {
        const sourceLayer = resolve(rootDir, "packages", layer);
        for (const entry of await readdir(sourceLayer, { withFileTypes: true })) {
            if (!entry.isDirectory()) continue;
            mirrors.push(mirrorNodeModules(
                join(sourceLayer, entry.name, "node_modules"),
                join(temporaryRoot, "packages", layer, entry.name, "node_modules"),
                overrides,
            ));
        }
    }
    mirrors.push(mirrorNodeModules(
        resolve(rootDir, "packages/surfaces/cms-control/node_modules"),
        join(temporaryControl, "node_modules"),
        overrides,
    ));
    await Promise.all(mirrors);
}

async function temporaryWorkspacePackages(temporaryRoot: string): Promise<Map<string, string>> {
    const packages = new Map<string, string>();
    for (const layer of ["foundation", "features", "resources", "surfaces", "runtimes"]) {
        const layerRoot = join(temporaryRoot, "packages", layer);
        let entries;
        try {
            entries = await readdir(layerRoot, { withFileTypes: true });
        } catch (error) {
            if (error instanceof Error && "code" in error && error.code === "ENOENT") continue;
            throw error;
        }
        for (const entry of entries) {
            if (!entry.isDirectory()) continue;
            const packageRoot = join(layerRoot, entry.name);
            const manifest = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8")) as { name?: unknown };
            if (typeof manifest.name === "string") packages.set(manifest.name, packageRoot);
        }
    }
    return packages;
}

async function mirrorNodeModules(
    sourceRoot: string,
    targetRoot: string,
    overrides: ReadonlyMap<string, string>,
): Promise<void> {
    let entries;
    try {
        entries = await readdir(sourceRoot, { withFileTypes: true });
    } catch (error) {
        if (error instanceof Error && "code" in error && error.code === "ENOENT") return;
        throw error;
    }
    await mkdir(targetRoot, { recursive: true });
    for (const entry of entries) {
        if (entry.name === "@bernouy") {
            const targetScope = join(targetRoot, entry.name);
            await mkdir(targetScope, { recursive: true });
            for (const scopedEntry of await readdir(join(sourceRoot, entry.name), { withFileTypes: true })) {
                const packageName = `@bernouy/${scopedEntry.name}`;
                await symlink(
                    overrides.get(packageName) ?? join(sourceRoot, entry.name, scopedEntry.name),
                    join(targetScope, scopedEntry.name),
                    "dir",
                );
            }
            continue;
        }
        await symlink(join(sourceRoot, entry.name), join(targetRoot, entry.name), "dir");
    }
}

async function runBunRecipe(args: string[], cwd: string, label: string): Promise<void> {
    const process = Bun.spawn([Bun.argv[0]!, ...args], {
        cwd,
        stdout: "pipe",
        stderr: "pipe",
    });
    const [exitCode, stdout, stderr] = await Promise.all([
        process.exited,
        new Response(process.stdout).text(),
        new Response(process.stderr).text(),
    ]);
    if (exitCode === 0) return;
    const details = [stderr.trim(), stdout.trim()].filter(Boolean).join("\n");
    throw new Error(`${label} failed with exit code ${exitCode}${details ? `:\n${details}` : ""}`);
}
