import { afterEach, describe, expect, test } from "bun:test";
import type { IntegrationPackageEnvelopeV1 } from "@bernouy/cms-integration-packages";
import type { IntegrationDefinition } from "@bernouy/cms-integrations";
import {
    validateVerificationJobResultForAdmission,
    type AdmissionDependencyReferenceV1,
} from "@bernouy/cms-integration-verification";
import { runPostgresPlatformVerification, type VerificationSandboxInput } from "../../src";
import { createPostgresPlatformVerificationAdapter } from "../../src/sandbox/service/postgres";
import { dependencyMatrixCheck } from "../../src/sandbox/service/postgres/checks/contracts";
import type { DependencyMatrixExecution } from "../../src/sandbox/service/postgres/suites/dependencies";
import { DIGEST_A, DIGEST_B } from "../fixtures/contracts";
import {
    createPostgresPlatformVerificationAdapter as createFixtureAdapter,
    postgresPlatformInputFixture,
} from "../fixtures/postgresAdapter";

const adapters: ReturnType<typeof createPostgresPlatformVerificationAdapter>[] = [];

afterEach(async () => {
    await Promise.all(adapters.splice(0).map(async (adapter) => await adapter.dispose?.()));
});

describe("non-PostgreSQL generated platform contracts", () => {
    test("fails closed when a required migration proof has no production executor", async () => {
        const base = await postgresPlatformInputFixture(dependencyPackage());
        const input: VerificationSandboxInput = {
            ...base,
            workload: {
                ...base.workload,
                migrationInputs: [{} as VerificationSandboxInput["workload"]["migrationInputs"][number]],
            },
        };

        await expect(
            runPostgresPlatformVerification(input, createFixtureAdapter(), new AbortController().signal),
        ).rejects.toThrow("cannot execute required migration proofs");
    });

    test("rejects a connector function and CMS Source route without a declared HTTP contract", async () => {
        const input = await postgresPlatformInputFixture(functionPackage(false));
        const result = await execute(input);
        const suite = result.results.find((entry) => entry.suiteId === "platform-declared-http-contracts");

        expect(suite?.outcome).toBe("failed");
        expect(suite?.platformEvidence?.checks.flatMap((check) => check.findings)).toEqual([
            { code: "function-http-contract-missing", path: "connectors.0.functions.probe" },
            { code: "source-endpoint-http-contract-missing", path: "artifacts.sources.primary.endpoints.health" },
        ]);
    });

    test("binds an exact declared method and route without claiming runtime HTTP execution", async () => {
        const input = await postgresPlatformInputFixture(functionPackage(true));
        const result = await execute(input);
        const suite = result.results.find((entry) => entry.suiteId === "platform-declared-http-contracts");

        expect(suite?.outcome).toBe("passed");
        expect(suite?.platformEvidence?.checks.map((check) => check.subjectCount)).toEqual([1, 1]);
        await expect(
            validateVerificationJobResultForAdmission(
                result,
                input.workload.admission,
                input.workload.policy,
                input.workload.attempt,
            ),
        ).resolves.toBeDefined();
    });

    test("requires exact minimum and stable dependency resolution points", async () => {
        const dependencies = [
            { selection: "minimum" as const, kind: "dependency", version: "1.0.0", packageDigest: DIGEST_A },
            { selection: "stable" as const, kind: "dependency", version: "1.4.0", packageDigest: DIGEST_B },
        ];
        const passed = await dependencyChecks(dependencyDefinition(), dependencies);
        expect(passed.map(({ outcome }) => outcome)).toEqual(["passed", "passed", "passed"]);

        const coincident = [
            { selection: "minimum", kind: "dependency", version: "1.0.0", packageDigest: DIGEST_A },
            { selection: "stable", kind: "dependency", version: "1.0.0", packageDigest: DIGEST_A },
        ] as const;
        expect((await dependencyChecks(dependencyDefinition(), coincident)).map(({ outcome }) => outcome)).toEqual([
            "passed",
            "passed",
            "passed",
        ]);

        const incomplete = await dependencyChecks(dependencyDefinition(), dependencies.slice(0, 1));
        expect(incomplete[0]?.findings).toEqual([
            { code: "dependency-resolution-missing", path: "dependencies.dependency.stable" },
        ]);
        expect(incomplete[2]?.findings).toEqual([]);
    });

    test("does not invent minimum compatibility when a dependency omits its version range", async () => {
        const dependencies = [
            { selection: "minimum", kind: "dependency", version: "1.0.0", packageDigest: DIGEST_A },
            { selection: "stable", kind: "dependency", version: "1.4.0", packageDigest: DIGEST_B },
        ] as const;
        const checks = await dependencyChecks(
            { ...dependencyDefinition(), dependencies: [{ name: "Dependency", kind: "dependency" }] },
            dependencies,
        );

        expect(checks[0]?.findings).toContainEqual({
            code: "dependency-version-range-missing",
            path: "dependencies.dependency",
        });
    });
});

async function execute(input: VerificationSandboxInput) {
    const adapter = createPostgresPlatformVerificationAdapter();
    adapters.push(adapter);
    return (
        await runPostgresPlatformVerification(
            input,
            {
                ...adapter,
                async verifyAuthorSuites({ suites }) {
                    return suites.map((suite) => ({
                        suiteId: suite.suiteId,
                        suiteDigest: suite.contentDigest,
                        outcome: "passed" as const,
                        durationMs: 1,
                        evidenceDigest: suite.contentDigest,
                    }));
                },
            },
            new AbortController().signal,
        )
    ).verification;
}

async function dependencyChecks(
    definition: IntegrationDefinition,
    dependencies: readonly AdmissionDependencyReferenceV1[],
) {
    const executions = (["minimum", "stable"] as const).flatMap((selection): DependencyMatrixExecution[] => {
        const packages = dependencies
            .filter((entry) => entry.selection === selection)
            .map(({ kind, version, packageDigest }) => ({ kind, version, packageDigest }));
        return packages.length === 0
            ? []
            : [
                  {
                      selection,
                      packages,
                      candidate: { kind: "example", version: "1.2.0", packageDigest: DIGEST_A },
                      outcome: "passed",
                  },
              ];
    });
    return await dependencyMatrixCheck(definition, dependencies, executions);
}

function dependencyDefinition(): IntegrationDefinition {
    return {
        kind: "example",
        label: "Example",
        version: "1.2.0",
        inputs: [],
        dependencies: [{ name: "Dependency", kind: "dependency", versionRange: "^1.0.0" }],
    };
}

function dependencyPackage(): IntegrationPackageEnvelopeV1 {
    return packageWithDefinition({
        kind: "example",
        label: "Example",
        version: "1.2.0",
        inputs: [],
        dependencies: [{ name: "Dependency", kind: "dependency", versionRange: "^1.0.0" }],
    });
}

function functionPackage(withContract: boolean): IntegrationPackageEnvelopeV1 {
    const compatibility = withContract
        ? {
              compatibility: {
                  http: {
                      endpoints: [
                          {
                              route: "/health",
                              method: "GET",
                              requiredInputs: [],
                              requiredHeaders: [],
                              responses: [{ status: "200" }],
                          },
                      ],
                      requiredSecrets: [],
                  },
              },
          }
        : {};
    return packageWithDefinition({
        kind: "example",
        label: "Example",
        version: "1.2.0",
        inputs: [],
        connectors: [
            {
                provider: "supabase",
                functions: [{ name: "probe", directory: "functions/probe", ...compatibility }],
            },
        ],
        artifacts: [
            {
                type: "source",
                source: {
                    id: "primary",
                    meta: { name: "Primary" },
                    endpoints: [
                        {
                            endpointId: "health",
                            method: "GET",
                            targetUrl: "{{connectors.supabase.functionsBaseUrl}}/probe/health",
                            params: [],
                        },
                    ],
                },
            },
        ],
    });
}

function packageWithDefinition(definition: unknown): IntegrationPackageEnvelopeV1 {
    return {
        schema: "cms.integration.package.v1",
        kind: "example",
        version: "1.2.0",
        definition: "definition.json",
        releaseNotes: "release-notes.md",
        files: {
            "definition.json": { encoding: "utf8", content: JSON.stringify(definition) },
            "release-notes.md": { encoding: "utf8", content: "Contract verification" },
            "functions/probe/index.ts": { encoding: "utf8", content: "export default () => new Response();" },
        },
    };
}
