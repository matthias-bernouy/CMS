import { expect, test } from "bun:test";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseSourceSnapshot } from "repository/repository/authoring/snapshot";
import { captureCollectionSources } from "repository/exports/repository/authoring/build";
import { sourceFixture } from "../../../../../../../tests/fixtures/repository/sourceBuild";

const MiB = 1024 * 1024;
const definition = { path: "definition.json", content: "{}" };

test("source snapshots admit 16,384 total files and 1,024 assets and refuse the next entry", () => {
    const assets = Array.from({ length: 1024 }, (_, id) => ({
        path: `assets/${id}.txt`,
        fileId: "local",
        generation: "snapshot",
    }));
    const files = [
        definition,
        ...Array.from({ length: 16_384 - assets.length - 1 }, (_, id) => ({
            path: `texts/group/${id}.json`,
            content: "{}",
        })),
    ];
    expect(parseSourceSnapshot(JSON.stringify({ files, assets })).files).toHaveLength(15_360);
    expect(() =>
        parseSourceSnapshot(JSON.stringify({ files: [...files, { path: "texts/extra.json", content: "{}" }], assets })),
    ).toThrow("too many files");
    expect(() =>
        parseSourceSnapshot(
            JSON.stringify({
                files: [definition],
                assets: [...assets, { path: "assets/extra.txt", fileId: "local", generation: "snapshot" }],
            }),
        ),
    ).toThrow();
});

test.each(["é", "😀"])("CLI and CMS apply the same exact 1 MiB UTF-8 text boundary for %s", async (character) => {
    const f = await sourceFixture();
    const content = character.repeat(MiB / Buffer.byteLength(character));
    const path = "texts/large.json";
    const files = [definition, { path, content }];
    try {
        expect(parseSourceSnapshot(JSON.stringify({ files })).files[1]!.content).toBe(content);
        await mkdir(join(f.directory, "texts"));
        await writeFile(join(f.directory, path), content);
        expect(
            parseSourceSnapshot((await captureCollectionSources(f.directory)).sourceJson).files.find(
                (file) => file.path === path,
            )?.content,
        ).toBe(content);
        files[1]!.content += character;
        expect(() => parseSourceSnapshot(JSON.stringify({ files }))).toThrow("Invalid authoring source file");
        await writeFile(join(f.directory, path), content + character);
        await expect(captureCollectionSources(f.directory)).rejects.toThrow("exceeds its limit");
    } finally {
        await f.close();
    }
});

test("the serialized source JSON boundary includes paths and escaping", () => {
    const files = [
        definition,
        ...Array.from({ length: 8 }, (_, id) => ({ path: `texts/${id}.json`, content: "x".repeat(MiB) })),
    ];
    const excess = Buffer.byteLength(JSON.stringify({ files })) - 8 * MiB;
    files[1]!.content = files[1]!.content.slice(excess);
    const exact = JSON.stringify({ files });
    expect(Buffer.byteLength(exact)).toBe(8 * MiB);
    expect(parseSourceSnapshot(exact).files).toHaveLength(9);
    files[1]!.content += "x";
    expect(() => parseSourceSnapshot(JSON.stringify({ files }))).toThrow();
});

test.each([
    ["texts/a", "texts/a/b.json"],
    ["texts/a/b.json", "texts/a"],
    ["texts/A.json", "texts/a.JSON"],
    ["texts/a-b.json", "texts/a", "texts/a/child.json"],
])("prefix indexing refuses overlapping and case-duplicate paths in any order: %j", (...paths) => {
    const files = [definition, ...paths.map((path) => ({ path, content: "{}" }))];
    expect(() => parseSourceSnapshot(JSON.stringify({ files }))).toThrow("overlap");
});
