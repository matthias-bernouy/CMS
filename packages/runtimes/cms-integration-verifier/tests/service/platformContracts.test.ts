import { afterEach, describe, expect, test } from "bun:test";
import type { IntegrationPackageEnvelopeV1 } from "@bernouy/cms-integration-packages";
import { validateVerificationJobResultForAdmission } from "@bernouy/cms-integration-verification";
import { runPostgresPlatformVerification, type VerificationSandboxInput } from "../../src";
import { createPostgresPlatformVerificationAdapter } from "../../src/sandbox/service/postgres";
import { DIGEST_A, DIGEST_B } from "../fixtures/contracts";
import { postgresPlatformInputFixture } from "../fixtures/postgresAdapter";

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

        await expect(execute(input)).rejects.toThrow("cannot execute required migration proofs");
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
        const base = await postgresPlatformInputFixture(dependencyPackage());
        const dependencies = [
            { selection: "minimum" as const, kind: "dependency", version: "1.0.0", packageDigest: DIGEST_A },
            { selection: "stable" as const, kind: "dependency", version: "1.4.0", packageDigest: DIGEST_B },
        ];
        const input = withDependencies(base, dependencies);
        const passed = await execute(input);
        expect(passed.results.find((entry) => entry.suiteId === "platform-dependency-matrix")?.outcome).toBe("passed");

        const coincident = withDependencies(base, [
            { selection: "minimum", kind: "dependency", version: "1.0.0", packageDigest: DIGEST_A },
            { selection: "stable", kind: "dependency", version: "1.0.0", packageDigest: DIGEST_A },
        ]);
        const coincidentResult = await execute(coincident);
        expect(coincidentResult.bindings.dependencyDigests).toEqual([DIGEST_A]);
        await expect(
            validateVerificationJobResultForAdmission(
                coincidentResult,
                coincident.workload.admission,
                coincident.workload.policy,
                coincident.workload.attempt,
            ),
        ).resolves.toBeDefined();

        const incomplete = withDependencies(base, dependencies.slice(0, 1));
        const failed = await execute(incomplete);
        expect(
            failed.results.find((entry) => entry.suiteId === "platform-dependency-matrix")?.platformEvidence?.checks[0]
                ?.findings,
        ).toEqual([{ code: "dependency-resolution-missing", path: "dependencies.dependency.stable" }]);
    });

    test("does not invent minimum compatibility when a dependency omits its version range", async () => {
        const base = await postgresPlatformInputFixture(
            packageWithDefinition({
                kind: "example",
                label: "Example",
                version: "1.2.0",
                inputs: [],
                dependencies: [{ name: "Dependency", kind: "dependency" }],
            }),
        );
        const input = withDependencies(base, [
            { selection: "minimum", kind: "dependency", version: "1.0.0", packageDigest: DIGEST_A },
            { selection: "stable", kind: "dependency", version: "1.4.0", packageDigest: DIGEST_B },
        ]);
        const result = await execute(input);

        expect(
            result.results.find((entry) => entry.suiteId === "platform-dependency-matrix")?.platformEvidence?.checks[0]
                ?.findings,
        ).toContainEqual({ code: "dependency-version-range-missing", path: "dependencies.dependency" });
    });
});

async function execute(input: VerificationSandboxInput) {
    const adapter = createPostgresPlatformVerificationAdapter();
    adapters.push(adapter);
    return (await runPostgresPlatformVerification(input, adapter, new AbortController().signal)).verification;
}

function withDependencies(
    input: VerificationSandboxInput,
    dependencies: VerificationSandboxInput["workload"]["admission"]["dependencies"],
): VerificationSandboxInput {
    return { ...input, workload: { ...input.workload, admission: { ...input.workload.admission, dependencies } } };
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
