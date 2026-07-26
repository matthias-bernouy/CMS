import { afterEach, describe, expect, test } from "bun:test";
import { readdir } from "node:fs/promises";
import { FsReviewedSchemaBaselineStore } from "@bernouy/cms-integration-registry/fs";
import { cleanupRegistryFixtures } from "../fixtures";
import {
    anonymousSqlPackage,
    bootstrapPlan,
    bootstrapPublisher,
    grandfatheringFor,
    legacySqlPackage,
    registryFixture,
    reviewedBaseline,
} from "./fixtures";

afterEach(cleanupRegistryFixtures);

describe("official bootstrap trust boundary", () => {
    test("rejects a PostgreSQL version outside the approved environment pair", async () => {
        const fixture = registryFixture();
        const integrationPackage = await legacySqlPackage("legacy");
        const tampered = await reviewedBaseline(integrationPackage, { postgresVersion: "15.13" });

        await expect(
            bootstrapPublisher(fixture).prepare(bootstrapPlan([integrationPackage], [tampered])),
        ).rejects.toThrow(/not approved/i);
        expect(await readdir(fixture.root)).toEqual([]);
    });

    test("rejects orphan stored baselines that are valid but outside the exact plan", async () => {
        const fixture = registryFixture();
        const planned = await legacySqlPackage("planned");
        const plannedBaseline = await reviewedBaseline(planned);
        const orphan = await legacySqlPackage("orphan");
        const store = new FsReviewedSchemaBaselineStore({ root: fixture.root });
        await store.append({ baseline: await reviewedBaseline(orphan), expectedCurrentRevisionId: null });

        await expect(bootstrapPublisher(fixture).prepare(bootstrapPlan([planned], [plannedBaseline]))).rejects.toThrow(
            /outside the exact plan/i,
        );
    });

    test("rejects duplicate and escaping anonymous-constraint grandfathering", async () => {
        const fixture = registryFixture();
        const integrationPackage = await anonymousSqlPackage("legacy");
        const baseline = await reviewedBaseline(integrationPackage);
        const finding = grandfatheringFor(integrationPackage);
        const duplicate = new Map([[integrationPackage.digest, [finding, finding]]]);
        await expect(
            bootstrapPublisher(fixture).prepare(bootstrapPlan([integrationPackage], [baseline], duplicate)),
        ).rejects.toThrow(/unique SQL path/i);

        const escaping = {
            ...finding,
            path: "../schema.sql",
            findings: finding.findings.map((entry) => ({ ...entry, path: "../schema.sql" })),
        };
        await expect(
            bootstrapPublisher(fixture).prepare(
                bootstrapPlan([integrationPackage], [baseline], new Map([[integrationPackage.digest, [escaping]]])),
            ),
        ).rejects.toThrow(/file path/i);
    });
});
