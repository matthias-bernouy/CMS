import { afterEach, describe, expect, test } from "bun:test";
import { mkdtempSync, rmSync, symlinkSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { IntegrationRegistryCatalogSnapshotReference } from "@bernouy/cms-integration-registry";
import {
    buildFsIntegrationRegistryCatalogSnapshot,
    SnapshotIntegrationDefinitionRepository,
    SnapshotIntegrationPackageSource,
} from "@bernouy/cms-integration-registry/fs";
import { writeIntegrationFixture } from "./fixtures";

const roots: string[] = [];

afterEach(() => {
    for (const root of roots.splice(0)) {
        rmSync(root, { recursive: true, force: true });
    }
});

describe("snapshot-backed repository adapters", () => {
    test("serves definitions, assets, and packages without rescanning catalog indexes", async () => {
        const root = registryRoot();
        const integrationRoot = writeIntegrationFixture(root, "domains/demo", {
            versions: ["1.0.0", "1.1.0"],
            stable: "1.0.0",
            latest: "1.1.0",
        });
        const snapshot = await buildFsIntegrationRegistryCatalogSnapshot({ root });
        const reference = new IntegrationRegistryCatalogSnapshotReference(snapshot);
        const packages = new SnapshotIntegrationPackageSource({ snapshots: reference });
        const stable = new SnapshotIntegrationDefinitionRepository({ snapshots: reference, packages });
        const latest = new SnapshotIntegrationDefinitionRepository({
            snapshots: reference,
            packages,
            defaultChannel: "latest",
        });

        unlinkSync(join(integrationRoot, "integration.json"));
        symlinkSync("missing-target", join(root, "unexpected-link"));

        expect((await stable.get("demo"))?.version).toBe("1.0.0");
        expect((await latest.get("demo"))?.version).toBe("1.1.0");
        expect(await stable.listVersions("demo")).toHaveLength(2);
        expect(await stable.getIndex("demo")).toEqual(snapshot.getIndex("demo"));
        expect(new TextDecoder().decode((await stable.getAsset("demo", "1.1.0", "assets/icon.svg"))?.bytes)).toContain(
            'data-version="1.1.0"',
        );
        expect((await packages.getPackage("demo", "1.1.0"))?.digest).toBe(
            snapshot.locateExactVersion("demo", "1.1.0")?.package.digest,
        );
    });

    test("shares only concurrent package reads and never retains a permanent package cache", async () => {
        const root = registryRoot();
        const integrationRoot = writeIntegrationFixture(root, "demo");
        const snapshot = await buildFsIntegrationRegistryCatalogSnapshot({ root });
        const source = new SnapshotIntegrationPackageSource({
            snapshots: new IntegrationRegistryCatalogSnapshotReference(snapshot),
        });

        const [first, concurrent] = await Promise.all([
            source.getPackage("demo", "1.0.0"),
            source.getPackage("demo", "1.0.0"),
        ]);
        expect(concurrent).toBe(first);
        rmSync(join(integrationRoot, "versions"), { recursive: true });

        await expect(source.getPackage("demo", "1.0.0")).rejects.toThrow(/no such file or directory/i);
    });

    test("serves package HEAD metadata from the snapshot after package files disappear", async () => {
        const root = registryRoot();
        const integrationRoot = writeIntegrationFixture(root, "demo");
        const snapshot = await buildFsIntegrationRegistryCatalogSnapshot({ root });
        const source = new SnapshotIntegrationPackageSource({
            snapshots: new IntegrationRegistryCatalogSnapshotReference(snapshot),
        });
        const captured = snapshot.locateExactVersion("demo", "1.0.0")!;
        rmSync(join(integrationRoot, "versions"), { recursive: true });

        expect(await source.getPackageMetadata("demo", "1.0.0")).toEqual({
            kind: "demo",
            version: "1.0.0",
            digest: captured.package.digest,
            canonicalBytes: captured.package.canonicalBytes,
        });
        await expect(source.getPackage("demo", "1.0.0")).rejects.toThrow(/no such file or directory/i);
    });

    test("fails closed when exact package bytes diverge from snapshot metadata", async () => {
        const root = registryRoot();
        const integrationRoot = writeIntegrationFixture(root, "demo");
        const snapshot = await buildFsIntegrationRegistryCatalogSnapshot({ root });
        const source = new SnapshotIntegrationPackageSource({
            snapshots: new IntegrationRegistryCatalogSnapshotReference(snapshot),
        });
        writeFileSync(join(integrationRoot, "versions", "1.0.0", "README.md"), "mutated\n");

        await expect(source.getPackage("demo", "1.0.0")).rejects.toThrow(/digest changed/);
    });

    test("serves the exact deep-frozen definition captured by the snapshot", async () => {
        const root = registryRoot();
        const integrationRoot = writeIntegrationFixture(root, "demo");
        const snapshot = await buildFsIntegrationRegistryCatalogSnapshot({ root });
        const repository = new SnapshotIntegrationDefinitionRepository({
            snapshots: new IntegrationRegistryCatalogSnapshotReference(snapshot),
        });
        const original = await repository.get("demo", "1.0.0");
        writeFileSync(
            join(integrationRoot, "versions", "1.0.0", "definition.json"),
            JSON.stringify({ kind: "demo", label: "Mutated", version: "1.0.0", inputs: [] }),
        );

        const retained = await repository.get("demo", "1.0.0");

        expect(retained).toBe(original);
        expect(retained?.label).toBe("Integration demo");
        expect(Object.isFrozen(retained)).toBe(true);
        expect(Object.isFrozen(retained?.inputs)).toBe(true);
        expect(() => Object.assign(retained!, { label: "Mutation attempt" })).toThrow(TypeError);
    });
});

function registryRoot(): string {
    const root = mkdtempSync(join(tmpdir(), "cms-integration-registry-"));
    roots.push(root);
    return root;
}
