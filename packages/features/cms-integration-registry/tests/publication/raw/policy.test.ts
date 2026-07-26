import { afterEach, describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import {
    IntegrationRegistryVerificationRequiredError,
    IntegrationRegistryVersionConflictError,
} from "@bernouy/cms-integration-registry";
import { FsIntegrationRegistryPublisher } from "@bernouy/cms-integration-registry/fs";
import { cleanupRegistryFixtures, publicationPackage, registryFixture } from "../fixtures";

afterEach(cleanupRegistryFixtures);

describe("raw filesystem integration publication policy", () => {
    test("keeps transitional publications exact but non-installable without advancing channels", async () => {
        const fixture = registryFixture({ rawPublicationPolicy: "publish-unverified" });
        const input = await publicationPackage("demo", "1.0.0");

        await fixture.rawPublisher.publish({ package: input });

        const index = fixture.snapshots.current().getIndex("demo");
        expect(index).toMatchObject({ versions: [{ version: "1.0.0", status: "unverified" }] });
        expect(index?.stable).toBeUndefined();
        expect(index?.latest).toBeUndefined();
        expect(fixture.snapshots.current().locateExactVersion("demo", "1.0.0")?.package.digest).toBe(input.digest);
    });

    test("rejects missing exact verification before creating any publication boundary", async () => {
        let boundaries = 0;
        const fixture = registryFixture({
            rawPublicationPolicy: "reject-unverified",
            afterBoundary() {
                boundaries += 1;
            },
        });
        const input = await publicationPackage("demo", "1.0.0");

        await expect(fixture.rawPublisher.publish({ package: input })).rejects.toMatchObject({
            code: "verification_required",
            kind: "demo",
            version: "1.0.0",
            packageDigest: input.digest,
        });
        await expect(fixture.rawPublisher.publish({ package: input })).rejects.toBeInstanceOf(
            IntegrationRegistryVerificationRequiredError,
        );
        expect(fixture.snapshots.current().getIndex("demo")).toBeNull();
        expect(boundaries).toBe(0);
        expect(readdirSync(fixture.root)).toEqual([]);
    });

    test("preserves immutable conflict semantics before the verification gate", async () => {
        const fixture = registryFixture({ rawPublicationPolicy: "publish-unverified" });
        const input = await publicationPackage("demo", "1.0.0");
        await fixture.rawPublisher.publish({ package: input });
        const rejectingPublisher = new FsIntegrationRegistryPublisher({
            ...fixture.publicationConfig,
            rawPublicationPolicy: "reject-unverified",
        });

        await expect(rejectingPublisher.publish({ package: input })).rejects.toBeInstanceOf(
            IntegrationRegistryVersionConflictError,
        );
        expect(fixture.snapshots.current().getIndex("demo")).toMatchObject({
            versions: [{ version: "1.0.0", status: "unverified" }],
        });
    });
});
