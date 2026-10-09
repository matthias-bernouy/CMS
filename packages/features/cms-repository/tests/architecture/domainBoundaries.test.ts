import { describe, expect, test } from "bun:test";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const sourceRoot = fileURLToPath(new URL("../../src/", import.meta.url));
const transpiler = new Bun.Transpiler({ loader: "ts" });

function importPaths(source: string): readonly string[] {
    const paths = transpiler.scan(source).imports.map((entry) => entry.path);
    // Include erased type-only imports/re-exports in the domain boundary check.
    for (const match of source.matchAll(/\bfrom\s+["']([^"']+)["']/g)) {
        paths.push(match[1]!);
    }
    return [...new Set(paths)];
}

function internalPath(specifier: string, file: string): string | undefined {
    if (specifier.startsWith("cms-repository/")) {
        return specifier.slice("cms-repository/".length);
    }
    if (specifier.startsWith(".")) {
        return relative(sourceRoot, resolve(dirname(file), specifier));
    }
    return undefined;
}

describe("repository domain boundaries", () => {
    test.each(["contracts", "exports/contracts"])("keeps %s independent of provider and site state", async (domain) => {
        const violations: string[] = [];
        for await (const file of new Bun.Glob("**/*.ts").scan({ cwd: resolve(sourceRoot, domain), absolute: true })) {
            for (const specifier of importPaths(await Bun.file(file).text())) {
                const target = internalPath(specifier, file);
                if (
                    (target !== undefined &&
                        !target.startsWith("contracts/") &&
                        !target.startsWith("exports/contracts/")) ||
                    specifier.startsWith("@bernouy/cms-repository")
                ) {
                    violations.push(`${relative(sourceRoot, file)} -> ${specifier}`);
                }
            }
        }
        expect(violations).toEqual([]);
    });

    test.each(["providers", "collections"])(
        "%s consumes contracts through the contract export facade",
        async (domain) => {
            const violations: string[] = [];
            for await (const file of new Bun.Glob("**/*.ts").scan({
                cwd: resolve(sourceRoot, domain),
                absolute: true,
            })) {
                for (const specifier of importPaths(await Bun.file(file).text())) {
                    const target = internalPath(specifier, file);
                    if (
                        (target !== undefined &&
                            !target.startsWith(`${domain}/`) &&
                            !target.startsWith("repository-http/") &&
                            target !== "exports/contracts" &&
                            !target.startsWith("exports/contracts/")) ||
                        (specifier.startsWith("@bernouy/cms-repository") &&
                            !specifier.startsWith(`@bernouy/cms-repository/${domain}`) &&
                            !specifier.startsWith("@bernouy/cms-repository/contracts"))
                    ) {
                        violations.push(`${relative(sourceRoot, file)} -> ${specifier}`);
                    }
                }
            }
            expect(violations).toEqual([]);
        },
    );

    test("keeps repository HTTP transport independent of domains", async () => {
        const violations: string[] = [];
        for await (const file of new Bun.Glob("**/*.ts").scan({
            cwd: resolve(sourceRoot, "repository-http"),
            absolute: true,
        })) {
            for (const specifier of importPaths(await Bun.file(file).text())) {
                const target = internalPath(specifier, file);
                if (
                    (target !== undefined && !target.startsWith("repository-http/")) ||
                    specifier.startsWith("@bernouy/cms-repository")
                ) {
                    violations.push(`${relative(sourceRoot, file)} -> ${specifier}`);
                }
            }
        }
        expect(violations).toEqual([]);
    });
});
