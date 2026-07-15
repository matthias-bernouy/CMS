import { describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";

describe("filesystem integration repository confinement", () => {
    test("rejects an integration directory symlink outside the repository", async () => {
        const root = mkdtempSync(join(tmpdir(), "cms-integrations-security-"));
        const outside = mkdtempSync(join(tmpdir(), "cms-integrations-outside-"));
        writeJson(join(outside, "integration.json"), {
            kind: "demo",
            label: "Demo",
            versions: [{ version: "1.0.0", path: "versions/1.0.0", definition: "versions/1.0.0/definition.json" }],
        });
        symlinkSync(outside, join(root, "demo"), "dir");
        const repository = new FsIntegrationDefinitionRepository(root);

        await expect(repository.getIndex("demo")).rejects.toThrow(/escapes integration repository root/);
    });

    test("rejects version paths that cross into another integration", async () => {
        const fixture = createFixture();
        const foreignVersion = join(fixture.root, "foreign", "versions", "1.0.0");
        mkdirSync(foreignVersion, { recursive: true });
        writeDefinition(join(foreignVersion, "definition.json"));
        writeIndex(fixture, {
            path: "../foreign/versions/1.0.0",
            definition: "../foreign/versions/1.0.0/definition.json",
        });

        await expect(fixture.repository.get("demo")).rejects.toThrow(/escapes integration version root/);
    });

    test("rejects a definition outside the selected version", async () => {
        const fixture = createFixture();
        const otherVersion = join(fixture.integrationRoot, "versions", "2.0.0");
        mkdirSync(otherVersion, { recursive: true });
        writeDefinition(join(otherVersion, "definition.json"), "2.0.0");
        writeIndex(fixture, {
            path: "versions/1.0.0",
            definition: "versions/2.0.0/definition.json",
        });

        await expect(fixture.repository.get("demo")).rejects.toThrow(/escapes integration version root/);
    });

    test("rejects version and asset symlinks that resolve outside their roots", async () => {
        const versionFixture = createFixture({ createVersion: false });
        const outsideVersion = join(versionFixture.root, "outside-version");
        mkdirSync(outsideVersion, { recursive: true });
        writeDefinition(join(outsideVersion, "definition.json"));
        symlinkSync(outsideVersion, versionFixture.versionRoot, "dir");

        await expect(versionFixture.repository.get("demo")).rejects.toThrow(/escapes integration version root/);

        const assetFixture = createFixture();
        const assetRoot = join(assetFixture.versionRoot, "assets");
        const outsideAsset = join(assetFixture.root, "outside.svg");
        mkdirSync(assetRoot, { recursive: true });
        writeFileSync(outsideAsset, "<svg></svg>");
        symlinkSync(outsideAsset, join(assetRoot, "icon.svg"), "file");

        await expect(assetFixture.repository.getAsset("demo", undefined, "assets/icon.svg"))
            .rejects.toThrow(/escapes integration asset root/);
    });

    test("rejects bloc and view symlinks that resolve outside the version", async () => {
        const blocFixture = createFixture();
        const outsideBloc = join(blocFixture.root, "outside-bloc");
        mkdirSync(join(blocFixture.versionRoot, "blocs"), { recursive: true });
        mkdirSync(outsideBloc, { recursive: true });
        writeFileSync(join(outsideBloc, "Bloc.ts"), "export {};");
        symlinkSync(outsideBloc, join(blocFixture.versionRoot, "blocs", "card"), "dir");
        writeBlocDefinition(blocFixture, "blocs/card");

        await expect(blocFixture.repository.get("demo")).rejects.toThrow(/escapes integration bloc root/);

        const viewFixture = createFixture();
        const blocRoot = join(viewFixture.versionRoot, "blocs", "card");
        const outsideView = join(viewFixture.root, "outside-view.ts");
        mkdirSync(blocRoot, { recursive: true });
        writeFileSync(outsideView, "export {};");
        symlinkSync(outsideView, join(blocRoot, "Bloc.ts"), "file");
        writeBlocDefinition(viewFixture, "blocs/card");

        await expect(viewFixture.repository.get("demo")).rejects.toThrow(/escapes integration bloc root/);
    });
});

type Fixture = {
    root: string;
    integrationRoot: string;
    versionRoot: string;
    definitionPath: string;
    repository: FsIntegrationDefinitionRepository;
};

function createFixture(options: { createVersion?: boolean } = {}): Fixture {
    const root = mkdtempSync(join(tmpdir(), "cms-integrations-security-"));
    const integrationRoot = join(root, "demo");
    const versionRoot = join(integrationRoot, "versions", "1.0.0");
    mkdirSync(options.createVersion === false ? join(integrationRoot, "versions") : versionRoot, { recursive: true });
    const fixture = {
        root,
        integrationRoot,
        versionRoot,
        definitionPath: join(versionRoot, "definition.json"),
        repository: new FsIntegrationDefinitionRepository(root),
    };
    writeIndex(fixture, {
        path: "versions/1.0.0",
        definition: "versions/1.0.0/definition.json",
    });
    if (options.createVersion !== false) writeDefinition(fixture.definitionPath);
    return fixture;
}

function writeIndex(fixture: Fixture, version: { path: string; definition: string }): void {
    writeJson(join(fixture.integrationRoot, "integration.json"), {
        kind: "demo",
        label: "Demo",
        stable: "1.0.0",
        versions: [{ version: "1.0.0", ...version }],
    });
}

function writeDefinition(path: string, version = "1.0.0"): void {
    writeJson(path, { kind: "demo", label: "Demo", version, inputs: [] });
}

function writeBlocDefinition(fixture: Fixture, path: string): void {
    writeJson(fixture.definitionPath, {
        kind: "demo",
        label: "Demo",
        version: "1.0.0",
        inputs: [],
        artifacts: [{ type: "bloc", bloc: { tag: "demo-card", name: "Demo card", path } }],
    });
}

function writeJson(path: string, value: unknown): void {
    writeFileSync(path, `${JSON.stringify(value, null, 4)}\n`);
}
