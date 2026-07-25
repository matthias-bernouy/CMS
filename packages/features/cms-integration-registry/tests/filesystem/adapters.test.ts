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

    test("caches immutable package bytes by digest after the first exact-location read", async () => {
        const root = registryRoot();
        const integrationRoot = writeIntegrationFixture(root, "demo");
        const snapshot = await buildFsIntegrationRegistryCatalogSnapshot({ root });
        const source = new SnapshotIntegrationPackageSource({
            snapshots: new IntegrationRegistryCatalogSnapshotReference(snapshot),
        });

        const first = await source.getPackage("demo", "1.0.0");
        rmSync(join(integrationRoot, "versions"), { recursive: true });
        const second = await source.getPackage("demo", "1.0.0");

        expect(second).toBe(first);
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
});

function registryRoot(): string {
    const root = mkdtempSync(join(tmpdir(), "cms-integration-registry-"));
    roots.push(root);
    return root;
}
