import { readFile, readdir, stat } from "node:fs/promises";
import { join, relative } from "node:path";
import { percentage } from "../policy/comparison";
import { parseLcov } from "./lcov";
import { isPackageSourceFile, normalizePath, REPOSITORY_ROOT, repositoryPath, shouldSkipDirectory } from "../paths";
import { assertEveryPackageHasTests } from "../policy/policy";
import type { CoveragePackage, PackageCoverage } from "../types";

async function pathExists(path: string): Promise<boolean> {
    try {
        await stat(path);
        return true;
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") {
            return false;
        }
        throw error;
    }
}

async function collectSourceFiles(root: string, packagePath: string): Promise<Set<string>> {
    const sourceFiles = new Set<string>();
    async function visit(directory: string): Promise<void> {
        for (const entry of await readdir(directory, { withFileTypes: true })) {
            if (entry.isDirectory() && shouldSkipDirectory(entry.name)) {
                continue;
            }
            const absolutePath = join(directory, entry.name);
            if (entry.isDirectory()) {
                await visit(absolutePath);
            } else {
                const path = repositoryPath(absolutePath);
                if (isPackageSourceFile(path, packagePath)) {
                    sourceFiles.add(path);
                }
            }
        }
    }
    await visit(root);
    return sourceFiles;
}

export async function discoverPackages(): Promise<CoveragePackage[]> {
    const packages: CoveragePackage[] = [];
    for (const layer of await readdir(join(REPOSITORY_ROOT, "packages"), { withFileTypes: true })) {
        if (!layer.isDirectory()) {
            continue;
        }
        const layerPath = join(REPOSITORY_ROOT, "packages", layer.name);
        for (const entry of await readdir(layerPath, { withFileTypes: true })) {
            if (!entry.isDirectory()) {
                continue;
            }
            const packageRoot = join(layerPath, entry.name);
            const manifest = JSON.parse(await readFile(join(packageRoot, "package.json"), "utf8")) as {
                name?: unknown;
            };
            if (typeof manifest.name !== "string") {
                throw new Error(`Package at ${relative(REPOSITORY_ROOT, packageRoot)} has no name`);
            }
            packages.push({
                name: manifest.name,
                path: normalizePath(relative(REPOSITORY_ROOT, packageRoot)),
                hasTests: await pathExists(join(packageRoot, "tests")),
            });
        }
    }
    const sortedPackages = packages.sort((left, right) => left.name.localeCompare(right.name));
    assertEveryPackageHasTests(sortedPackages);
    return sortedPackages;
}

export async function measurePackage(packageInfo: CoveragePackage, temporaryRoot: string): Promise<PackageCoverage> {
    const outputDirectory = join(temporaryRoot, packageInfo.name.replace(/[^a-z0-9]+/gi, "-"));
    const testProcess = Bun.spawn(
        [
            process.execPath,
            "--smol",
            "test",
            `${packageInfo.path}/tests`,
            "--coverage",
            "--coverage-reporter=lcov",
            `--coverage-dir=${outputDirectory}`,
        ],
        {
            cwd: REPOSITORY_ROOT,
            env: { ...process.env, CI: "true" },
            stdout: "pipe",
            stderr: "pipe",
        },
    );
    const stdout = new Response(testProcess.stdout).text();
    const stderr = new Response(testProcess.stderr).text();
    const exitCode = await testProcess.exited;
    const [testOutput, testErrors] = await Promise.all([stdout, stderr]);
    if (exitCode !== 0) {
        process.stdout.write(testOutput);
        process.stderr.write(testErrors);
        throw new Error(`Coverage tests failed for ${packageInfo.name}`);
    }
    console.log(`Coverage tests passed for ${packageInfo.name}`);

    const parsed = parseLcov(await readFile(join(outputDirectory, "lcov.info"), "utf8"), packageInfo.path);
    const sourceFiles = await collectSourceFiles(join(REPOSITORY_ROOT, packageInfo.path), packageInfo.path);
    const coveredSourceFiles = [...parsed.coveredFiles].filter((path) => sourceFiles.has(path)).sort();
    const uncoveredSourceFiles = [...sourceFiles].filter((path) => !parsed.coveredFiles.has(path)).sort();
    return {
        path: packageInfo.path,
        coveredSourceFiles,
        uncoveredSourceFiles,
        files: { covered: coveredSourceFiles.length, total: sourceFiles.size },
        functions: parsed.functions,
        lines: parsed.lines,
    };
}

export function coverageReport(packages: Record<string, PackageCoverage>): string {
    const rows = [
        "| Package | Files | Lines | Functions |",
        "|---|---:|---:|---:|",
        ...Object.entries(packages).map(
            ([name, coverage]) =>
                `| ${name} | ${percentage(coverage.files)} | ${percentage(coverage.lines)} | ${percentage(coverage.functions)} |`,
        ),
    ];
    return ["## Per-package coverage", "", ...rows, ""].join("\n");
}
