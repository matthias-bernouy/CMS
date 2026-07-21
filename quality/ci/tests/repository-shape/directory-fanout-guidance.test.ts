import { expect, test } from "bun:test";
import {
    collectDirectoryEntries,
    findDirectoryFanoutFindings,
    TARGET_DIRECTORY_ENTRIES,
    WIDE_DIRECTORY_ENTRIES,
} from "../../repository-shape/directory-fanout/check";

function files(directory: string, count: number): string[] {
    return Array.from({ length: count }, (_, index) => `${directory}/entry-${index}.ts`);
}

test("directory guidance uses seven-entry and eight-entry review thresholds", () => {
    expect(TARGET_DIRECTORY_ENTRIES).toBe(7);
    expect(WIDE_DIRECTORY_ENTRIES).toBe(8);
});

test("directory guidance counts immediate files and folders at every level", () => {
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

test("directory guidance classifies every current directory without a Git baseline", () => {
    const current = collectDirectoryEntries([
        ...files("small", 7),
        ...files("review", 8),
        ...files("wide", 9),
    ]);
    expect(findDirectoryFanoutFindings(current)).toEqual([
        { path: "review", currentEntries: 8, severity: "info" },
        { path: "wide", currentEntries: 9, severity: "warning" },
    ]);
});
