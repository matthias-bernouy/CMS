import { describe, expect, test } from "bun:test";
import type { BuiltOfficialIntegrationCandidate } from "@bernouy/cms-official-integrations/publication";
import { runRepositoryPublicationCommand } from "../../src/repositoryPublication/command";

const PACKAGE_A = integrationPackage("alpha", "1.0.0", "a");
const PACKAGE_B = integrationPackage("beta", "2.0.0", "b");

describe("official repository publication command", () => {
    test("dry-run builds and reports without reading credentials or making requests", async () => {
        const output: string[] = [];
        const exit = await runRepositoryPublicationCommand(["publish-official", "--dry-run"], {
            environment: {},
            buildCandidates: async () => [PACKAGE_A, PACKAGE_B],
            readToken: async () => Promise.reject(new Error("must not read")),
            publish: async () => Promise.reject(new Error("must not publish")),
            write: (line) => output.push(line),
            writeError: (line) => output.push(`ERROR ${line}`),
        });

        expect(exit).toBe(0);
        expect(output).toEqual([
            "Official repository candidate plan: 2 candidate(s)",
            expect.stringMatching(/^PLAN alpha@1\.0\.0 package-sha256:a{64} verification-sha256:/),
            expect.stringMatching(/^PLAN beta@2\.0\.0 package-sha256:b{64} verification-sha256:/),
            "Summary: planned=2 published=0 unchanged=0 failed=0 skipped=0",
        ]);
    });

    test("publishes sequentially and accepts an exact immutable collision", async () => {
        const output: string[] = [];
        const attempts: string[] = [];
        const outcomes = [
            { outcome: "published", candidateId: "candidate-1" } as const,
            { outcome: "unchanged" } as const,
        ];
        const exit = await runRepositoryPublicationCommand(
            [
                "publish-official",
                "--url=https://repository.internal/.cms/repository-management",
                "--token-file=/run/secrets/token",
            ],
            {
                environment: {},
                buildCandidates: async () => [PACKAGE_A, PACKAGE_B],
                readToken: async (path) => {
                    expect(path).toBe("/run/secrets/token");
                    return "management-token";
                },
                publish: async (config, candidate) => {
                    expect(config.token).toBe("management-token");
                    attempts.push(`${candidate.kind}@${candidate.version}`);
                    return outcomes.shift()!;
                },
                write: (line) => output.push(line),
                writeError: (line) => output.push(`ERROR ${line}`),
            },
        );

        expect(exit).toBe(0);
        expect(attempts).toEqual(["alpha@1.0.0", "beta@2.0.0"]);
        expect(output.at(-1)).toBe("Summary: planned=2 published=1 unchanged=1 failed=0 skipped=0");
    });

    test("stops with a non-zero summary on rejection and never prints raw response data", async () => {
        const output: string[] = [];
        const exit = await runRepositoryPublicationCommand(
            [
                "publish-official",
                "--url=https://repository.internal/.cms/repository-management",
                "--token-file=/run/secrets/token",
            ],
            {
                environment: {},
                buildCandidates: async () => [PACKAGE_A, PACKAGE_B],
                readToken: async () => "management-token",
                publish: async () => ({
                    outcome: "failed",
                    reason: "rejected",
                    status: 422,
                    code: "integration_compatibility_rejected",
                }),
                write: (line) => output.push(line),
                writeError: (line) => output.push(line),
            },
        );

        expect(exit).toBe(1);
        expect(output).toContain(
            "FAILED alpha@1.0.0 reason=rejected status=422 code=integration_compatibility_rejected",
        );
        expect(output.at(-1)).toBe("Summary: planned=2 published=0 unchanged=0 failed=1 skipped=1");
        expect(output.join("\n")).not.toContain("management-token");
        expect(output.join("\n")).not.toContain("repository.internal");
    });

    test("does not echo an unknown argument that could contain a secret", async () => {
        const errors: string[] = [];
        const exit = await runRepositoryPublicationCommand(["publish-official", "super-secret"], {
            environment: {},
            write: () => undefined,
            writeError: (line) => errors.push(line),
        });

        expect(exit).toBe(1);
        expect(errors.join("\n")).not.toContain("super-secret");
    });
});

function integrationPackage(kind: string, version: string, digestCharacter: string): BuiltOfficialIntegrationCandidate {
    return {
        kind,
        version,
        packageDigest: digestCharacter.repeat(64),
        verificationDigest: "e".repeat(64),
        candidateDigest: "f".repeat(64),
        canonicalBytes: new TextEncoder().encode(`{"kind":"${kind}"}`),
    };
}
