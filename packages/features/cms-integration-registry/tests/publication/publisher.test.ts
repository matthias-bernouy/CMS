import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
    IntegrationCompatibilityAdmissionError,
    IntegrationRegistryVersionConflictError,
    IntegrationRegistryVersionOrderError,
} from "@bernouy/cms-integration-registry";
import {
    readCompatibilityAdmissionReport,
    SnapshotIntegrationPackageSource,
} from "@bernouy/cms-integration-registry/fs";
import { cleanupRegistryFixtures, publicationPackage, registryFixture } from "./fixtures";

afterEach(cleanupRegistryFixtures);

describe("filesystem integration registry publication", () => {
    test("publishes a new kind atomically with stable, latest, package and admission report", async () => {
        const fixture = registryFixture();
        const input = await publicationPackage("demo", "1.0.0");

        const result = await fixture.publisher.publish({ package: input });

        expect(result).toMatchObject({ kind: "demo", version: "1.0.0", digest: input.digest });
        expect(result.report).toMatchObject({ outcome: "not-applicable", noBaselineReason: "new-kind" });
        expect(fixture.snapshots.current().getIndex("demo")).toMatchObject({
            stable: "1.0.0",
            latest: "1.0.0",
            versions: [{ version: "1.0.0" }],
        });
        const source = new SnapshotIntegrationPackageSource({ snapshots: fixture.snapshots });
        expect((await source.getPackage("demo", "1.0.0"))?.digest).toBe(input.digest);
        expect(
            await readCompatibilityAdmissionReport(reportPath(fixture.root, "demo", "1.0.0"), {
                kind: "demo",
                version: "1.0.0",
                digest: input.digest,
            }),
        ).toEqual(result.report);
        expect(readdirSync(join(fixture.root, ".journals"))).toEqual([]);
        expect(readdirSync(join(fixture.root, ".staging"))).toEqual([]);
    });

    test("advances latest while preserving stable and accepts implementation-only patches", async () => {
        const fixture = registryFixture();
        await fixture.publisher.publish({ package: await publicationPackage("demo", "1.0.0") });

        const result = await fixture.publisher.publish({
            package: await publicationPackage("demo", "1.0.1", {}, "fixed implementation\n"),
        });

        expect(result.report).toMatchObject({ outcome: "compatible", releaseLevel: "patch", admissible: true });
        expect(fixture.snapshots.current().getIndex("demo")).toMatchObject({
            stable: "1.0.0",
            latest: "1.0.1",
            versions: [{ version: "1.0.0" }, { version: "1.0.1" }],
        });
    });

    test("rejects incompatible patches before exposing filesystem or snapshot state", async () => {
        const fixture = registryFixture();
        await fixture.publisher.publish({ package: await publicationPackage("demo", "1.0.0") });
        const before = fixture.snapshots.current();
        const incompatible = publicationPackage("demo", "1.0.1", {
            inputs: [{ name: "required", label: "Required", type: "text", required: true }],
        });

        await expect(fixture.publisher.publish({ package: await incompatible })).rejects.toBeInstanceOf(
            IntegrationCompatibilityAdmissionError,
        );

        expect(fixture.snapshots.current()).toBe(before);
        expect(fixture.snapshots.current().locateExactVersion("demo", "1.0.1")).toBeNull();
        expect(existsSync(join(fixture.root, "demo", "versions", "1.0.1"))).toBe(false);
        expect(readdirSync(join(fixture.root, ".journals"))).toEqual([]);
        expect(readdirSync(join(fixture.root, ".staging"))).toEqual([]);
    });

    test("returns conflicts for an existing or non-increasing version without mutating the index", async () => {
        const fixture = registryFixture();
        await fixture.publisher.publish({ package: await publicationPackage("demo", "1.0.0") });
        await fixture.publisher.publish({ package: await publicationPackage("demo", "1.1.0") });
        const indexBefore = readFileSync(join(fixture.root, "demo", "integration.json"));

        await expect(
            fixture.publisher.publish({ package: await publicationPackage("demo", "1.1.0") }),
        ).rejects.toBeInstanceOf(IntegrationRegistryVersionConflictError);
        await expect(
            fixture.publisher.publish({ package: await publicationPackage("demo", "1.0.1") }),
        ).rejects.toBeInstanceOf(IntegrationRegistryVersionOrderError);

        expect(readFileSync(join(fixture.root, "demo", "integration.json"))).toEqual(indexBefore);
        expect(readdirSync(join(fixture.root, ".staging"))).toEqual([]);
    });
});

function reportPath(root: string, kind: string, version: string): string {
    return join(root, kind, ".registry", "reports", version, "admission.json");
}
