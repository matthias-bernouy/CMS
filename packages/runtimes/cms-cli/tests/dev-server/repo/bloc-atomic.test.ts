import { expect, test } from "bun:test";
import { existsSync, mkdtempSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { LocalFsCmsRepository } from "cms-cli/dev-server/repo/LocalFsCmsRepository";
import { writeBlocSourceAtomically } from "cms-cli/push/blocs/atomicSource";
import { writePulledBloc } from "cms-cli/push/blocs/pullLocation";
import { generateSiteBlocSource } from "cms-cli/push/blocs/siteBuilder";
import type { SiteBlocDefinition } from "@bernouy/cms-content";

test("a failed bloc replacement keeps the previous folder and registry entry", async () => {
    const siteDir = mkdtempSync(join(tmpdir(), "p9r-dev-repo-"));
    const repository = new LocalFsCmsRepository(siteDir, new Map());
    await repository.createBloc(blocWrite("site-demo"));
    const path = join(siteDir, "blocs", "Layout", "site-demo", "Bloc.ts");
    const before = await readFile(path, "utf-8");
    const viewBefore = await repository.getBlocViewJS("site-demo");

    await expect(repository.replaceBloc(blocWrite("wrong-tag"))).rejects.toThrow(
        'written source did not produce bloc "site-demo"',
    );

    expect(await readFile(path, "utf-8")).toBe(before);
    expect(await repository.getBlocViewJS("site-demo")).toBe(viewBefore);
});

test("pull atomically relocates one recognized site-builder folder when its draft group changes", async () => {
    const siteDir = mkdtempSync(join(tmpdir(), "p9r-pull-relocate-"));
    const definition = publishedDefinition();
    const previous = join(siteDir, "blocs", "Old", definition.tag);
    const target = join(siteDir, "blocs", "New", definition.tag);
    await writeBlocSourceAtomically(previous, generateSiteBlocSource(definition));
    const changed = {
        ...definition,
        draftRevision: 2,
        draft: { ...definition.draft, group: "New" },
    };

    await writePulledBloc(
        siteDir,
        "New",
        definition.tag,
        generateSiteBlocSource(changed, changed.draft),
        definition.ownership,
    );

    expect(existsSync(previous)).toBe(false);
    expect(existsSync(target)).toBe(true);
    expect(JSON.parse(await readFile(join(target, "builder.json"), "utf-8")).draft.group).toBe("New");
});

test("pull leaves both folders untouched when the destination is not recognized", async () => {
    const siteDir = mkdtempSync(join(tmpdir(), "p9r-pull-relocate-"));
    const definition = publishedDefinition();
    const previous = join(siteDir, "blocs", "Old", definition.tag);
    const target = join(siteDir, "blocs", "New", definition.tag);
    await writeBlocSourceAtomically(previous, generateSiteBlocSource(definition));
    await mkdir(target, { recursive: true });
    await writeFile(join(target, "marker.txt"), "foreign");
    const changed = { ...definition, draftRevision: 2, draft: { ...definition.draft, group: "New" } };

    await expect(
        writePulledBloc(
            siteDir,
            "New",
            definition.tag,
            generateSiteBlocSource(changed, changed.draft),
            definition.ownership,
        ),
    ).rejects.toThrow("unrecognized local bloc folder");

    expect(existsSync(join(previous, "builder.json"))).toBe(true);
    expect(await readFile(join(target, "marker.txt"), "utf-8")).toBe("foreign");
});

function blocWrite(manifestTag: string) {
    const encode = (value: string) => Buffer.from(value, "utf-8").toString("base64");
    return {
        id: "site-demo",
        name: "Demo",
        group: "Layout",
        description: "Demo bloc",
        viewJS: "",
        editorJS: "",
        source: {
            "manifest.json": encode(
                `${JSON.stringify({
                    "default-tag": manifestTag,
                    bloc: "./Bloc.ts",
                    editor: "./BlocEditor.ts",
                    meta: { title: "Demo", description: "Demo bloc" },
                })}\n`,
            ),
            "Bloc.ts": encode("export class DemoBloc extends HTMLElement {}\n"),
            "BlocEditor.ts": encode(`
                import { Editor } from "@bernouy/cms-control/editor";
                export class DemoEditor extends Editor {}
            `),
        },
    };
}

function publishedDefinition(): SiteBlocDefinition {
    const snapshot = {
        name: "Site shell",
        group: "Old",
        description: "",
        structure: [],
        slots: [],
        defaultContent: "",
        dependencies: [],
    };
    return {
        schema: "cms.site-bloc.v1",
        id: "definition-site-shell",
        tag: "site-shell",
        ownership: { kind: "site-builder", definitionId: "definition-site-shell" },
        lifecycle: "active",
        draftRevision: 1,
        publishedRevision: 1,
        draft: snapshot,
        published: snapshot,
        createdAt: new Date("2026-07-27T10:00:00.000Z"),
        updatedAt: new Date("2026-07-27T10:00:00.000Z"),
    };
}
