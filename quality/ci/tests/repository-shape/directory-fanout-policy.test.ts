import { expect, test } from "bun:test";
import {
    collectDirectoryEntries,
    findDirectoryFanoutViolations,
    inferPureDirectoryRenames,
    MAX_DIRECTORY_ENTRIES,
    TARGET_DIRECTORY_ENTRIES,
} from "../../repository-shape/directory-fanout/ratchet";

function files(directory: string, count: number): string[] {
    return Array.from({ length: count }, (_, index) => `${directory}/entry-${index}.ts`);
}

test("directory policy keeps a seven-entry target and an eight-entry hard cap", () => {
    expect(TARGET_DIRECTORY_ENTRIES).toBe(7);
    expect(MAX_DIRECTORY_ENTRIES).toBe(8);
});

test("directory policy counts distinct immediate files and folders at every level", () => {
    const entries = collectDirectoryEntries([
        "alpha/one.ts",
        "alpha/nested/two.ts",
        "alpha/nested/three.ts",
        "beta/file.ts",
    ]);
    expect([...entries.get(".") ?? []]).toEqual(["alpha", "beta"]);
    expect([...entries.get("alpha") ?? []]).toEqual(["one.ts", "nested"]);
    expect([...entries.get("alpha/nested") ?? []]).toEqual(["two.ts", "three.ts"]);
});

test("directory policy rejects a new directory above the hard cap", () => {
    const current = collectDirectoryEntries(files("new", 9));
    expect(findDirectoryFanoutViolations(current, new Map())).toEqual([
        {
            path: "new",
            currentEntries: 9,
            allowedEntries: 8,
            reason: "new_over_limit",
        },
    ]);
});

test("directory policy lets legacy debt shrink but never grow", () => {
    const baseline = collectDirectoryEntries(files("legacy", 10));
    expect(findDirectoryFanoutViolations(collectDirectoryEntries(files("legacy", 9)), baseline)).toEqual([]);
    expect(findDirectoryFanoutViolations(collectDirectoryEntries(files("legacy", 11)), baseline)).toEqual([
        {
            path: "legacy",
            currentEntries: 11,
            allowedEntries: 10,
            reason: "legacy_growth",
        },
    ]);
});

test("directory policy locks debt to the latest lower baseline", () => {
    const reducedBaseline = collectDirectoryEntries(files("legacy", 9));
    expect(findDirectoryFanoutViolations(collectDirectoryEntries(files("legacy", 10)), reducedBaseline)).toHaveLength(1);
    const compliantBaseline = collectDirectoryEntries(files("legacy", 8));
    expect(findDirectoryFanoutViolations(collectDirectoryEntries(files("legacy", 9)), compliantBaseline)).toHaveLength(1);
});

test("directory policy transfers debt only for a complete unambiguous move", () => {
    const baselinePaths = files("old", 9);
    const currentPaths = files("new", 9);
    const renamedFiles = new Map(currentPaths.map((path, index) => [path, baselinePaths[index]!]));
    const directories = inferPureDirectoryRenames(baselinePaths, currentPaths, renamedFiles);
    expect([...directories]).toEqual([["new", "old"]]);
    expect(
        findDirectoryFanoutViolations(
            collectDirectoryEntries(currentPaths),
            collectDirectoryEntries(baselinePaths),
            directories,
        ),
    ).toEqual([]);
});

test("directory policy refuses partial moves and copies", () => {
    const baselinePaths = files("old", 9);
    const currentPaths = [...files("old", 8), "new/entry-8.ts"];
    const partial = new Map([["new/entry-8.ts", "old/entry-8.ts"]]);
    expect(inferPureDirectoryRenames(baselinePaths, currentPaths, partial).size).toBe(0);
    const copiedPaths = [...baselinePaths, ...files("copy", 9)];
    const copies = new Map(files("copy", 9).map((path, index) => [path, baselinePaths[index]!]));
    expect(inferPureDirectoryRenames(baselinePaths, copiedPaths, copies).size).toBe(0);
});
