import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { IntegrationRegistryCatalogSnapshotReference } from "@bernouy/cms-integration-registry";
import {
    buildFsIntegrationRegistryCatalogSnapshot,
    SnapshotIntegrationDefinitionRepository,
} from "@bernouy/cms-integration-registry/fs";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { writeIntegrationFixture, writeJson } from "./fixtures";

const roots: string[] = [];

afterEach(() => {
    for (const root of roots.splice(0)) {
        rmSync(root, { recursive: true, force: true });
    }
});

describe("bounded snapshot definition hydration", () => {
    test("retains versioned covers and thumbnail source bytes through immutable snapshot hydration", async () => {
        const root = registryRoot();
        const cover = { path: "assets/icon.svg", alt: "Collection cover" };
        const integrationRoot = writeIntegrationFixture(root, "presentation", {
            versions: ["1.0.0", "1.1.0"],
            transformIndex(index) {
                index.cover = cover;
            },
        });
        for (const version of ["1.0.0", "1.1.0"]) {
            const versionRoot = join(integrationRoot, "versions", version);
            const blocRoot = join(versionRoot, "blocs/card");
            mkdirSync(blocRoot, { recursive: true });
            writeFileSync(join(blocRoot, "template.html"), "<article><slot></slot></article>");
            writeJson(join(blocRoot, "manifest.json"), { thumbnail: cover });
            writeJson(join(versionRoot, "definition.json"), {
                kind: "presentation",
                label: "Presentation",
                version,
                inputs: [],
                cover,
                artifacts: [
                    {
                        type: "bloc",
                        bloc: {
                            tag: "inline-card",
                            name: "Inline",
                            compositionHTML: "<article></article>",
                            thumbnail: cover,
                        },
                    },
                    {
                        type: "bloc",
                        bloc: {
                            tag: "presentation-card",
                            name: "Card",
                            path: "blocs/card",
                            composition: "template.html",
                            editor: null,
                        },
                    },
                ],
            });
        }
        const snapshot = await buildFsIntegrationRegistryCatalogSnapshot({ root });
        const repository = new SnapshotIntegrationDefinitionRepository({
            snapshots: new IntegrationRegistryCatalogSnapshotReference(snapshot),
        });
        expect(snapshot.diagnostics).toEqual([]);
        expect((await repository.list())[0]?.cover).toEqual(cover);
        expect((await repository.getIndex("presentation"))?.cover).toEqual(cover);
        for (const version of ["1.0.0", "1.1.0"]) {
            const definition = await repository.get("presentation", version);
            const fsDefinition = await new FsIntegrationDefinitionRepository(root).get("presentation", version);
            expect(definition).toEqual(fsDefinition);
            const inline = definition?.artifacts?.[0];
            expect(inline?.type === "bloc" ? atob(inline.bloc.source![cover.path]!) : "").toContain(
                `data-version="${version}"`,
            );
            const artifact = definition?.artifacts?.[1];
            expect(artifact?.type === "bloc" ? artifact.bloc.thumbnail : undefined).toEqual(cover);
            const image = await repository.getAsset("presentation", version, cover.path);
            expect(new TextDecoder().decode(image?.bytes)).toContain(`data-version="${version}"`);
            expect(artifact?.type === "bloc" ? atob(artifact.bloc.source![cover.path]!) : "").toContain(
                `data-version="${version}"`,
            );
        }
    });
    test("keeps collections readable when an optional thumbnail file is missing", async () => {
        const root = registryRoot();
        const integrationRoot = writeIntegrationFixture(root, "missing-image", { versions: ["1.0.0"] });
        const versionRoot = join(integrationRoot, "versions/1.0.0");
        const blocRoot = join(versionRoot, "blocs/card");
        mkdirSync(blocRoot, { recursive: true });
        writeFileSync(join(blocRoot, "template.html"), "<article></article>");
        const thumbnail = { path: "assets/missing.png" };
        writeJson(join(blocRoot, "manifest.json"), { thumbnail });
        writeJson(join(versionRoot, "definition.json"), {
            kind: "missing-image",
            label: "Missing image",
            version: "1.0.0",
            inputs: [],
            artifacts: [
                {
                    type: "bloc",
                    bloc: {
                        tag: "missing-card",
                        name: "Card",
                        path: "blocs/card",
                        composition: "template.html",
                        editor: null,
                    },
                },
            ],
        });
        const snapshot = await buildFsIntegrationRegistryCatalogSnapshot({ root });
        const repository = new SnapshotIntegrationDefinitionRepository({
            snapshots: new IntegrationRegistryCatalogSnapshotReference(snapshot),
        });
        expect(snapshot.diagnostics).toEqual([]);
        const definition = await repository.get("missing-image", "1.0.0");
        expect(definition).toEqual(await new FsIntegrationDefinitionRepository(root).get("missing-image", "1.0.0"));
        const artifact = definition?.artifacts?.[0];
        expect(artifact?.type === "bloc" ? artifact.bloc.thumbnail : undefined).toEqual(thumbnail);
        expect(await repository.getAsset("missing-image", "1.0.0", thumbnail.path)).toBeNull();
    });

    test("matches the existing loader for an official fragmented definition with blocs", async () => {
        const officialRoot = resolve(import.meta.dir, "../../../../resources/official-integrations/integrations");
        const snapshot = await buildFsIntegrationRegistryCatalogSnapshot({ root: officialRoot });
        const snapshotRepository = new SnapshotIntegrationDefinitionRepository({
            snapshots: new IntegrationRegistryCatalogSnapshotReference(snapshot),
        });
        const filesystemRepository = new FsIntegrationDefinitionRepository(officialRoot);

        expect(await snapshotRepository.get("ulvia", "4.0.0")).toEqual(
            await filesystemRepository.get("ulvia", "4.0.0"),
        );
    });

    test("detects the same fragmented-definition cycle as the existing filesystem resolver", async () => {
        const root = registryRoot();
        const integrationRoot = writeIntegrationFixture(root, "cycle");
        const versionRoot = join(integrationRoot, "versions", "1.0.0");
        const definitions = join(versionRoot, "definitions");
        mkdirSync(definitions);
        writeJson(join(versionRoot, "definition.json"), {
            schema: "cms.integration.definition.bundle.v1",
            root: "definitions/root.json",
        });
        writeJson(join(definitions, "root.json"), {
            schema: "cms.integration.definition.v1",
            kind: "cycle",
            label: "Cycle",
            version: "1.0.0",
            inputs: { $include: "cycle.json" },
        });
        writeJson(join(definitions, "cycle.json"), { $include: "root.json" });
        const filesystemRepository = new FsIntegrationDefinitionRepository(root);

        await expect(filesystemRepository.get("cycle", "1.0.0")).rejects.toThrow(/Cyclic integration definition/);
        const snapshot = await buildFsIntegrationRegistryCatalogSnapshot({ root });
        expect(snapshot.diagnostics).toEqual([
            expect.objectContaining({
                code: "invalid-package",
                message: expect.stringContaining("Cyclic integration definition"),
            }),
        ]);
    });
});

function registryRoot(): string {
    const root = mkdtempSync(join(tmpdir(), "cms-integration-definition-parity-"));
    roots.push(root);
    return root;
}
