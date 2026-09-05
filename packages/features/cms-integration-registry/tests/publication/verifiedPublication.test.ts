import { afterEach, describe, expect, test } from "bun:test";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
    IntegrationRegistryVersionConflictError,
    IntegrationRegistryVersionOrderError,
} from "@bernouy/cms-integration-registry";
import { SnapshotIntegrationPackageSource } from "@bernouy/cms-integration-registry/fs";
import { cleanupRegistryFixtures, publicationPackage, registryFixture } from "./fixtures";

afterEach(cleanupRegistryFixtures);

describe("trusted prepared filesystem package publication", () => {
    test("publishes package, manifest, index, and snapshot without a duplicate compatibility report", async () => {
        const fixture = registryFixture();
        const input = await publicationPackage("demo", "1.0.0");

        const result = await fixture.publisher.publish({ package: input });

        expect(result).toMatchObject({ kind: "demo", version: "1.0.0", digest: input.digest });
        expect(fixture.snapshots.current().getIndex("demo")).toMatchObject({
            stable: "1.0.0",
            latest: "1.0.0",
            versions: [{ version: "1.0.0" }],
        });
        const source = new SnapshotIntegrationPackageSource({ snapshots: fixture.snapshots });
        expect((await source.getPackage("demo", "1.0.0"))?.digest).toBe(input.digest);
        expect(existsSync(join(fixture.root, "demo", ".registry", "reports"))).toBe(false);
        expect(readdirSync(join(fixture.root, ".journals"))).toEqual([]);
        expect(readdirSync(join(fixture.root, ".staging"))).toEqual([]);
    });

    test("rejects existing or non-increasing coordinates without mutating the index", async () => {
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

    test("rejects a new legacy candidate that claims a platform-owned native tag", async () => {
        const fixture = registryFixture();
        const input = await publicationPackage("legacy-native", "1.0.0", {
            artifacts: [
                {
                    type: "bloc",
                    bloc: { tag: "h1", name: "Heading", compositionHTML: "<h1>Heading</h1>" },
                },
            ],
        });

        await expect(fixture.publisher.publish({ package: input })).rejects.toThrow(
            /native HTML tag "h1" is platform-owned/,
        );
        expect(fixture.snapshots.current().getIndex("legacy-native")).toBeNull();
    });
});
