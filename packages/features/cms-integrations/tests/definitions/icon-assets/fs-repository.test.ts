import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";

describe("filesystem integration icon assets", () => {
    test("hydrates source and dashboard SVGs while preserving semantic icons", async () => {
        const fixture = createFixture();
        writeDefinition(fixture, "assets/shared.svg");
        writeFileSync(join(fixture.versionRoot, "assets", "shared.svg"), svg("shared"));

        const definition = await fixture.repository.get("icon-pack");
        const [source, dashboard, semantic] = definition?.artifacts ?? [];

        expect(source?.type === "source" ? source.source.meta : null).toMatchObject({
            icon: "assets/shared.svg",
            svg: expect.stringContaining('data-name="shared"'),
        });
        expect(dashboard?.type === "dashboard-view" ? dashboard.view.meta : null).toMatchObject({
            icon: "assets/shared.svg",
            svg: expect.stringContaining('data-name="shared"'),
        });
        expect(semantic?.type === "dashboard-view" ? semantic.view.meta : null).toEqual({
            name: "Semantic",
            icon: "layout",
        });
    });

    test("accepts multibyte SVGs below the character limit", async () => {
        const fixture = createFixture();
        const multibyteName = "é".repeat(7_900);
        writeDefinition(fixture, "assets/multibyte.svg");
        writeFileSync(join(fixture.versionRoot, "assets", "multibyte.svg"), svg(multibyteName));

        const definition = await fixture.repository.get("icon-pack");
        const source = definition?.artifacts?.[0];

        expect(source?.type === "source" ? source.source.meta.svg : null).toContain(multibyteName);
    });

    test("fails clearly for missing, invalid, oversized, and escaping icon assets", async () => {
        const fixture = createFixture();
        writeDefinition(fixture, "assets/missing.svg");
        expect(fixture.repository.get("icon-pack")).rejects.toThrow(/was not found/);

        writeDefinition(fixture, "assets/invalid.svg");
        writeFileSync(join(fixture.versionRoot, "assets", "invalid.svg"), "not an svg");
        expect(fixture.repository.get("icon-pack")).rejects.toThrow(/must contain an SVG root/);

        writeDefinition(fixture, "assets/large.svg");
        writeFileSync(join(fixture.versionRoot, "assets", "large.svg"), svg("x".repeat(8_100)));
        expect(fixture.repository.get("icon-pack")).rejects.toThrow(/exceeds 8000 characters/);

        writeDefinition(fixture, "assets/huge.svg");
        writeFileSync(join(fixture.versionRoot, "assets", "huge.svg"), svg("x".repeat(32_100)));
        expect(fixture.repository.get("icon-pack")).rejects.toThrow(/exceeds 32000 bytes/);

        writeDefinition(fixture, "assets/../outside.svg");
        writeFileSync(join(fixture.versionRoot, "outside.svg"), svg("outside"));
        expect(fixture.repository.get("icon-pack")).rejects.toThrow(/must reference an SVG inside assets/);
    });

    test("keeps public raster asset reads unbounded", async () => {
        const fixture = createFixture();
        const image = new Uint8Array(64_000);
        image.set([137, 80, 78, 71, 13, 10, 26, 10]);
        writeFileSync(join(fixture.versionRoot, "assets", "large.png"), image);

        const asset = await fixture.repository.getAsset("icon-pack", "1.0.0", "assets/large.png");

        expect(asset?.bytes.byteLength).toBe(64_000);
        expect(asset?.contentType).toBe("image/png");
    });
});

type Fixture = {
    versionRoot: string;
    definitionPath: string;
    repository: FsIntegrationDefinitionRepository;
};

function createFixture(): Fixture {
    const root = mkdtempSync(join(tmpdir(), "cms-icon-assets-"));
    const integrationRoot = join(root, "icon-pack");
    const versionRoot = join(integrationRoot, "versions", "1.0.0");
    mkdirSync(join(versionRoot, "assets"), { recursive: true });
    writeJson(join(integrationRoot, "integration.json"), {
        kind: "icon-pack",
        label: "Icon Pack",
        stable: "1.0.0",
        versions: [{ version: "1.0.0", path: "versions/1.0.0", definition: "versions/1.0.0/definition.json" }],
    });
    return {
        versionRoot,
        definitionPath: join(versionRoot, "definition.json"),
        repository: new FsIntegrationDefinitionRepository(root),
    };
}

function writeDefinition(fixture: Fixture, path: string): void {
    writeJson(fixture.definitionPath, {
        kind: "icon-pack",
        label: "Icon Pack",
        version: "1.0.0",
        inputs: [],
        artifacts: [
            { type: "source", source: { id: "items", meta: { name: "Items", icon: { path } }, endpoints: [] } },
            {
                type: "dashboard",
                dashboard: { id: "items", source: "items", meta: { name: "Items", icon: { path } }, views: [] },
            },
            {
                type: "dashboard",
                dashboard: { id: "semantic", source: "items", meta: { name: "Semantic", icon: "layout" }, views: [] },
            },
        ],
    });
}

function svg(name: string): string {
    return `<svg viewBox="0 0 24 24" data-name="${name}"><path d="M1 1h2"/></svg>`;
}

function writeJson(path: string, value: unknown): void {
    writeFileSync(path, `${JSON.stringify(value, null, 4)}\n`);
}
