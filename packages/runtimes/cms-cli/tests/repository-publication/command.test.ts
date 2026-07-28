import { describe, expect, test } from "bun:test";
import { runRepositoryPublicationCommand } from "../../src/repositoryPublication/command";
import type { BuiltIntegrationCandidate } from "../../src/repositoryPublication/candidate/contracts";
import { IntegrationCandidateBuildError } from "../../src/repositoryPublication/candidate/errors";

const PACKAGE_A = integrationPackage("alpha", "1.0.0", "a");
const PACKAGE_B = integrationPackage("beta", "2.0.0", "b");

describe("repository publication command", () => {
    test("dry-run builds and reports without reading credentials or making requests", async () => {
        const output: string[] = [];
        const exit = await runRepositoryPublicationCommand(["publish-official", "--dry-run"], {
            environment: {},
            buildCandidates: async () => [PACKAGE_A, PACKAGE_B],
            getAccessToken: async () => Promise.reject(new Error("must not read")),
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

    test("publishes a generic integration root with the neutral command output", async () => {
        const output: string[] = [];
        const sources: unknown[] = [];
        const exit = await runRepositoryPublicationCommand(["publish", "./demo", "--dry-run"], {
            environment: {},
            buildCandidates: async (source) => {
                sources.push(source);
                return [PACKAGE_A];
            },
            write: (line) => output.push(line),
            writeError: (line) => output.push(`ERROR ${line}`),
        });

        expect(exit).toBe(0);
        expect(sources).toEqual([{ type: "integration", root: expect.stringMatching(/\/demo$/u) }]);
        expect(output[0]).toBe("Repository candidate plan: 1 candidate(s)");
    });

    test("reports an actionable allowlisted generic build failure", async () => {
        const errors: string[] = [];
        const exit = await runRepositoryPublicationCommand(["publish", "./demo", "--dry-run"], {
            environment: {},
            buildCandidates: async () => {
                throw new IntegrationCandidateBuildError(
                    "verification_missing",
                    "Verification bundle verification/1.0.0.json must be a bounded, non-symlink regular file",
                );
            },
            write: () => undefined,
            writeError: (line) => errors.push(line),
        });

        expect(exit).toBe(1);
        expect(errors).toEqual([
            "Integration candidate build failed [verification_missing]: Verification bundle verification/1.0.0.json must be a bounded, non-symlink regular file",
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
            ["publish-official", "--url=HTTPS://Admin.Repository.Internal:443/cms"],
            {
                environment: {},
                buildCandidates: async () => [PACKAGE_A, PACKAGE_B],
                getAccessToken: async (cmsUrl) => {
                    expect(cmsUrl).toBe("HTTPS://Admin.Repository.Internal:443/cms");
                    return "pat-admin";
                },
                publish: async (config, candidate) => {
                    expect(config).toMatchObject({
                        managementUrl: "https://admin.repository.internal/cms/.cms/repository-management",
                        token: "pat-admin",
                    });
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
            ["publish-official", "--url=https://admin.repository.internal/cms"],
            {
                environment: {},
                buildCandidates: async () => [PACKAGE_A, PACKAGE_B],
                getAccessToken: async () => "pat-admin",
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
        expect(output.join("\n")).not.toContain("pat-admin");
        expect(output.join("\n")).not.toContain("admin.repository.internal");
    });

    test("uses P9R_URL and rejects publication when no CMS PAT is configured", async () => {
        const output: string[] = [];
        const exit = await runRepositoryPublicationCommand(["publish-official"], {
            environment: { P9R_URL: "https://admin.repository.internal/cms" },
            buildCandidates: async () => [PACKAGE_A],
            getAccessToken: async (cmsUrl) => {
                expect(cmsUrl).toBe("https://admin.repository.internal/cms");
                return null;
            },
            publish: async () => Promise.reject(new Error("must not publish")),
            write: (line) => output.push(line),
            writeError: (line) => output.push(line),
        });

        expect(exit).toBe(1);
        expect(output).toContain(
            "No CMS Personal Access Token found; create one in admin Profile and configure P9R_TOKEN or credentials.json",
        );
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

function integrationPackage(kind: string, version: string, digestCharacter: string): BuiltIntegrationCandidate {
    return {
        kind,
        version,
        packageDigest: digestCharacter.repeat(64),
        verificationDigest: "e".repeat(64),
        candidateDigest: "f".repeat(64),
        canonicalBytes: new TextEncoder().encode(`{"kind":"${kind}"}`),
    };
}
