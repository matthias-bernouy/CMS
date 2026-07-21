import { expect, test } from "bun:test";
import {
    collectDirectoryEntries,
    collectScopedDirectoryEntries,
    findDirectoryFanoutFindings,
    findDirectoryFanoutScopeRoots,
    hasBlockingDirectoryFanoutFindings,
    MAX_DIRECTORY_ENTRIES,
    TARGET_DIRECTORY_ENTRIES,
} from "../../repository-shape/directory-fanout/check";

function files(directory: string, count: number): string[] {
    return Array.from({ length: count }, (_, index) => `${directory}/entry-${index}.ts`);
}

test("directory policy uses a seven-entry target and an eight-entry maximum", () => {
    expect(TARGET_DIRECTORY_ENTRIES).toBe(7);
    expect(MAX_DIRECTORY_ENTRIES).toBe(8);
});

test("directory guidance counts immediate files and folders at every level", () => {
    const entries = collectDirectoryEntries([
        "alpha/one.ts",
        "alpha/nested/two.ts",
        "alpha/nested/three.ts",
        "beta/file.ts",
    ]);
    expect([...(entries.get(".") ?? [])]).toEqual(["alpha", "beta"]);
    expect([...(entries.get("alpha") ?? [])]).toEqual(["one.ts", "nested"]);
    expect([...(entries.get("alpha/nested") ?? [])]).toEqual(["two.ts", "three.ts"]);
});

test("directory policy classifies the current tree without a Git baseline", () => {
    const current = collectDirectoryEntries([...files("small", 7), ...files("review", 8), ...files("wide", 9)]);
    const findings = findDirectoryFanoutFindings(current);
    expect(findings).toEqual([
        { path: "review", currentEntries: 8, severity: "info" },
        { path: "wide", currentEntries: 9, severity: "error" },
    ]);
    const infoOnly = findDirectoryFanoutFindings(collectDirectoryEntries(files("review", 8)));
    expect(hasBlockingDirectoryFanoutFindings(infoOnly)).toBeFalse();
    expect(hasBlockingDirectoryFanoutFindings(findings)).toBeTrue();
});

test("scoped guidance only inspects real package trees and the quality tree", () => {
    const paths = [
        ...files("outside", 9),
        "packages/features/alpha/package.json",
        ...files("packages/features/alpha/src/wide", 9),
        ...files("packages/features/not-a-package/wide", 9),
        ...files("quality/ci/wide", 9),
    ];

    expect(findDirectoryFanoutScopeRoots(paths)).toEqual(["packages/features/alpha", "quality"]);

    const directories = collectScopedDirectoryEntries(paths);
    const findings = findDirectoryFanoutFindings(directories);

    expect(directories.has(".")).toBeFalse();
    expect(directories.has("packages")).toBeFalse();
    expect(directories.has("packages/features")).toBeFalse();
    expect(directories.has("outside")).toBeFalse();
    expect(directories.has("packages/features/not-a-package/wide")).toBeFalse();
    expect([...(directories.get("packages/features/alpha") ?? [])].sort()).toEqual(["package.json", "src"]);
    expect(findings.filter(({ severity }) => severity === "error")).toEqual([
        { path: "packages/features/alpha/src/wide", currentEntries: 9, severity: "error" },
        { path: "quality/ci/wide", currentEntries: 9, severity: "error" },
    ]);
});
