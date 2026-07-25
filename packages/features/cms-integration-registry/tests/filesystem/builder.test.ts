import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildFsIntegrationRegistryCatalogSnapshot } from "@bernouy/cms-integration-registry/fs";
import { writeIntegrationFixture } from "./fixtures";

const roots: string[] = [];

afterEach(() => {
    for (const root of roots.splice(0)) {
        rmSync(root, { recursive: true, force: true });
    }
});

describe("filesystem integration registry snapshot builder", () => {
    test("builds a valid catalog with exact package metadata", async () => {
        const root = registryRoot();
        writeIntegrationFixture(root, "domains/zulu");
        writeIntegrationFixture(root, "domains/alpha", { versions: ["1.0.0", "1.1.0"] });

        const snapshot = await buildFsIntegrationRegistryCatalogSnapshot({ root });

        expect(snapshot.health).toBe("healthy");
        expect(snapshot.summaries.map((summary) => summary.kind)).toEqual(["alpha", "zulu"]);
        expect(snapshot.listVersions("alpha").map((version) => version.version)).toEqual(["1.0.0", "1.1.0"]);
        expect(snapshot.locateExactVersion("alpha", "1.1.0")).toMatchObject({
            kind: "alpha",
            version: "1.1.0",
            definition: "definition.json",
            releaseNotes: "README.md",
            package: {
                schema: "cms.integration.package.v1",
                digest: expect.stringMatching(/^[a-f0-9]{64}$/),
                files: 3,
            },
        });
        expect(snapshot.diagnostics).toEqual([]);
    });

    test("quarantines one corrupt integration without poisoning valid kinds", async () => {
        const root = registryRoot();
        writeIntegrationFixture(root, "domains/valid");
        const corrupt = join(root, "domains", "corrupt");
        mkdirSync(corrupt, { recursive: true });
        writeFileSync(join(corrupt, "integration.json"), "{ broken json");

        const snapshot = await buildFsIntegrationRegistryCatalogSnapshot({ root });

        expect(snapshot.health).toBe("degraded");
        expect(snapshot.summaries.map((summary) => summary.kind)).toEqual(["valid"]);
        expect(snapshot.getIndex("corrupt")).toBeNull();
        expect(snapshot.diagnostics).toEqual([
            expect.objectContaining({
                code: "invalid-integration",
                stage: "index",
                source: corrupt,
            }),
        ]);
        expect(snapshot.quarantined).toEqual([
            {
                source: corrupt,
                diagnosticCodes: ["invalid-integration"],
            },
        ]);
    });

    test("excludes every package that claims a duplicate kind", async () => {
        const root = registryRoot();
        const first = writeIntegrationFixture(root, "domains/shared");
        const second = writeIntegrationFixture(root, "providers/shared");

        const snapshot = await buildFsIntegrationRegistryCatalogSnapshot({ root });

        expect(snapshot.summaries).toEqual([]);
        expect(snapshot.diagnostics).toEqual([
            expect.objectContaining({ code: "duplicate-kind", kind: "shared", source: first }),
            expect.objectContaining({ code: "duplicate-kind", kind: "shared", source: second }),
        ]);
        expect(snapshot.quarantined).toHaveLength(2);
    });

    test("reports duplicate version identities without hiding healthy siblings", async () => {
        const root = registryRoot();
        writeIntegrationFixture(root, "domains/valid");
        const duplicate = writeIntegrationFixture(root, "domains/duplicate", {
            versions: ["1.0.0", "1.0.0"],
        });

        const snapshot = await buildFsIntegrationRegistryCatalogSnapshot({ root });

        expect(snapshot.summaries.map((summary) => summary.kind)).toEqual(["valid"]);
        expect(snapshot.diagnostics).toEqual([
            expect.objectContaining({
                code: "duplicate-version-identity",
                stage: "identity",
                source: duplicate,
            }),
        ]);
    });

    test("bounds discovery before parsing an oversized index", async () => {
        const root = registryRoot();
        const oversized = join(root, "oversized");
        mkdirSync(oversized, { recursive: true });
        writeFileSync(join(oversized, "integration.json"), "x".repeat(513));

        const snapshot = await buildFsIntegrationRegistryCatalogSnapshot({
            root,
            catalogLimits: { maxIndexBytes: 512 },
        });

        expect(snapshot.health).toBe("degraded");
        expect(snapshot.diagnostics).toEqual([
            expect.objectContaining({
                code: "invalid-structure",
                stage: "discovery",
                source: oversized,
                message: expect.stringContaining("exceeds 512 bytes"),
            }),
        ]);
    });

    test("bounds the complete package before hydrating a large bloc", async () => {
        const root = registryRoot();
        const integrationRoot = writeIntegrationFixture(root, "demo");
        const versionRoot = join(integrationRoot, "versions", "1.0.0");
        const blocRoot = join(versionRoot, "blocs", "large");
        mkdirSync(blocRoot, { recursive: true });
        writeFileSync(join(blocRoot, "Bloc.ts"), "x".repeat(513));
        writeFileSync(
            join(versionRoot, "definition.json"),
            JSON.stringify({
                schema: "cms.integration.definition.v1",
                kind: "demo",
                label: "Demo",
                version: "1.0.0",
                inputs: [],
                artifacts: [{ type: "bloc", bloc: { tag: "large-bloc", name: "Large", path: "blocs/large" } }],
            }),
        );

        const snapshot = await buildFsIntegrationRegistryCatalogSnapshot({
            root,
            packageLimits: { maxFileBytes: 512 },
        });

        expect(snapshot.summaries).toEqual([]);
        expect(snapshot.diagnostics).toEqual([
            expect.objectContaining({
                code: "invalid-package",
                stage: "package",
                message: expect.stringContaining("file exceeds 512 decoded bytes"),
            }),
        ]);
    });

    test("bounds file count before definition hydration", async () => {
        const root = registryRoot();
        const integrationRoot = writeIntegrationFixture(root, "demo");
        const versionRoot = join(integrationRoot, "versions", "1.0.0");
        writeFileSync(join(versionRoot, "extra-a.txt"), "a");
        writeFileSync(join(versionRoot, "extra-b.txt"), "b");

        const snapshot = await buildFsIntegrationRegistryCatalogSnapshot({ root, packageLimits: { maxFiles: 3 } });

        expect(snapshot.summaries).toEqual([]);
        expect(snapshot.diagnostics).toEqual([
            expect.objectContaining({
                code: "invalid-package",
                stage: "package",
                message: expect.stringMatching(/exceeds 3 files|remaining file and directory limits/),
            }),
        ]);
    });

    test("rejects a symlink used as an indexed version root", async () => {
        const root = registryRoot();
        const integrationRoot = writeIntegrationFixture(root, "demo");
        const versionRoot = join(integrationRoot, "versions", "1.0.0");
        const target = join(integrationRoot, "version-target");
        rmSync(versionRoot, { recursive: true });
        mkdirSync(target);
        symlinkSync(target, versionRoot);

        const snapshot = await buildFsIntegrationRegistryCatalogSnapshot({ root });

        expect(snapshot.summaries).toEqual([]);
        expect(snapshot.diagnostics).toEqual([
            expect.objectContaining({
                code: "invalid-version",
                stage: "version",
                message: expect.stringContaining("non-symlink directory"),
            }),
        ]);
    });
});

function registryRoot(): string {
    const root = mkdtempSync(join(tmpdir(), "cms-integration-registry-"));
    roots.push(root);
    return root;
}
