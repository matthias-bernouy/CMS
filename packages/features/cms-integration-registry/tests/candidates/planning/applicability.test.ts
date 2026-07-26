import { afterEach, describe, expect, test } from "bun:test";
import type { ResolvedIntegrationPackage } from "@bernouy/cms-integration-packages";
import { FsIntegrationRegistryCandidateAdmissionPlanner } from "@bernouy/cms-integration-registry/fs";
import type { ReleaseAdmissionPolicySnapshotV1 } from "@bernouy/cms-integration-verification";
import { cleanupRegistryFixtures, publicationPackage, registryFixture } from "../../publication/fixtures";
import { planningPolicy, validatingCandidate, verificationCandidate } from "./fixtures";

afterEach(cleanupRegistryFixtures);

describe("platform suite applicability", () => {
    test.each([
        { name: "without SQL", package: packageWithoutSql, expected: [true, false, false] },
        { name: "with a private SQL schema", package: packageWithPrivateSql, expected: [true, false, true] },
        { name: "with a Data API schema", package: packageWithDataApiSql, expected: [true, true, true] },
    ])("pins explicit applicability $name", async ({ package: buildPackage, expected }) => {
        const fixture = registryFixture();
        const candidate = await verificationCandidate(await buildPackage());
        const store = await validatingCandidate(
            fixture.root,
            `candidate-${candidate.envelope.package.kind}`,
            candidate,
        );
        const plan = await new FsIntegrationRegistryCandidateAdmissionPlanner({
            snapshots: fixture.snapshots,
            mutations: fixture.mutations,
            candidates: store,
            reviewedSchemaBaselines: fixture.reviewedSchemaBaselines,
            policy: await applicabilityPolicy(),
        }).plan({ candidateId: `candidate-${candidate.envelope.package.kind}`, candidate });

        expect(plan.admission.suites.map((suite) => suite.applicable)).toEqual(expected);
    });

    test("does not let an author replace a mandatory platform suite", async () => {
        const fixture = registryFixture();
        const candidate = await verificationCandidate(await packageWithoutSql(), {
            conformance: [{ suiteId: "platform-always", entrypoint: "tests/conformance.ts" }],
        });
        const store = await validatingCandidate(fixture.root, "candidate-platform-conflict", candidate);
        const planner = new FsIntegrationRegistryCandidateAdmissionPlanner({
            snapshots: fixture.snapshots,
            mutations: fixture.mutations,
            candidates: store,
            reviewedSchemaBaselines: fixture.reviewedSchemaBaselines,
            policy: await applicabilityPolicy(),
        });

        await expect(planner.plan({ candidateId: "candidate-platform-conflict", candidate })).rejects.toThrow(
            /suite identifiers conflict/,
        );
    });
});

async function applicabilityPolicy(): Promise<ReleaseAdmissionPolicySnapshotV1> {
    const policy = await planningPolicy();
    const runner = policy.approvedRunners[0]!;
    return {
        ...policy,
        platformRequiredSuites: [
            { suiteId: "platform-always", suiteDigest: "a".repeat(64), runner, applicability: "always" },
            { suiteId: "platform-sql", suiteDigest: "b".repeat(64), runner, applicability: "sql-connectors" },
            {
                suiteId: "platform-data-api",
                suiteDigest: "c".repeat(64),
                runner,
                applicability: "data-api-schemas",
            },
        ],
    };
}

async function packageWithoutSql(): Promise<ResolvedIntegrationPackage> {
    return await publicationPackage("no-sql", "1.0.0");
}

async function packageWithPrivateSql(): Promise<ResolvedIntegrationPackage> {
    return await sqlPackage("private-sql", []);
}

async function packageWithDataApiSql(): Promise<ResolvedIntegrationPackage> {
    return await sqlPackage("data-api-sql", ["verifier_data"]);
}

async function sqlPackage(kind: string, dataApiSchemas: readonly string[]): Promise<ResolvedIntegrationPackage> {
    return await publicationPackage(
        kind,
        "1.0.0",
        {
            connectors: [
                {
                    provider: "supabase",
                    root: "connectors/supabase",
                    schemas: [{ path: "sql/schema.sql" }],
                    ...(dataApiSchemas.length === 0 ? {} : { dataApiSchemas }),
                    compatibility: { schema: { namespaces: [{ name: "verifier_data", relations: [] }] } },
                },
            ],
        },
        "SQL implementation\n",
        {
            "connectors/supabase/sql/schema.sql": {
                encoding: "utf8",
                content: "create schema if not exists verifier_data;\n",
            },
        },
    );
}
