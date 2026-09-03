import { afterEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { validateIntegrationCandidateEnvelope } from "@bernouy/cms-integration-verification";
import { runCli } from "../../src/cli";
import { LocalIntegrationRepository } from "../../src/repository/local";
import { resolveUlviaPaths } from "../../src/runtime/paths";
import { removeReadonlyTree, writeIntegrationSource } from "../fixtures";
import { emptyRemote, remoteFixture, temporaryRoot } from "./support";

const roots: string[] = [];
afterEach(async () => {
    await Promise.all(roots.splice(0).map(removeReadonlyTree));
});

describe("ulvia push", () => {
    test("publishes a local release, verifies public bytes, and resumes idempotently", async () => {
        const root = await temporaryRoot(roots);
        const source = join(root, "source");
        const data = join(root, "data");
        await writeIntegrationSource(source);
        const baseEnvironment = { ULVIA_DATA_DIR: data };
        await runCli(["release", "demo"], {
            environment: baseEnvironment,
            cwd: source,
            repositoryFetch: emptyRemote,
            releaseVerifier: { verify: async () => undefined },
            log: () => undefined,
        });

        const paths = resolveUlviaPaths(baseEnvironment);
        const local = new LocalIntegrationRepository(paths.repository, paths.packages);
        await local.init();
        const record = (await local.list())[0]!;
        const resolved = await local.getPackage(record);
        let published: Awaited<ReturnType<typeof validateIntegrationCandidateEnvelope>> | undefined;
        const authorization: Array<string | null> = [];
        const publicationFetch: typeof fetch = async (input, init) => {
            const request = new Request(input, init);
            authorization.push(request.headers.get("authorization"));
            if (request.method === "POST") {
                published = await validateIntegrationCandidateEnvelope(await request.json());
                return candidateResponse(published, "published", 202);
            }
            if (!published) {
                return Response.json({ code: "integration_not_found" }, { status: 404 });
            }
            return Response.json({
                kind: published.envelope.package.kind,
                versions: [
                    {
                        version: published.envelope.package.version,
                        digest: published.packageDigest,
                        release: { verificationDigest: published.verificationDigest },
                    },
                ],
            });
        };
        const output: string[] = [];
        const environment = {
            ...baseEnvironment,
            ULVIA_REPOSITORY_URL: "http://repository.example.test/.cms/repository",
            ULVIA_URL: "https://manager.example.test/cms",
            ULVIA_TOKEN: "pat-not-logged",
        };
        const options = {
            environment,
            repositoryFetch: remoteFixture(resolved),
            publicationFetch,
            log: (line: string) => output.push(line),
        };

        await runCli(["push", "demo"], options);
        await runCli(["push", "demo"], options);

        expect(published?.packageDigest).toBe(record.digest);
        expect(authorization.every((value) => value === "Bearer pat-not-logged")).toBeTrue();
        expect(output).toEqual(
            expect.arrayContaining([
                expect.stringContaining("PUBLISHED demo@1.0.0"),
                expect.stringContaining("UNCHANGED demo@1.0.0"),
            ]),
        );
        expect(output.join("\n")).not.toContain("pat-not-logged");
    });

    test("rejects credentials embedded in the manager URL", async () => {
        const root = await temporaryRoot(roots);
        await expect(
            runCli(["push", "demo", "--url=https://user:secret@manager.example.test"], {
                environment: { ULVIA_DATA_DIR: root },
            }),
        ).rejects.toThrow(/must not contain credentials/);
    });

    test("stops push --all before later coordinates after a rejection", async () => {
        const root = await temporaryRoot(roots);
        const source = join(root, "source");
        const data = join(root, "data");
        await writeIntegrationSource(source, "1.0.0", "alpha");
        await writeIntegrationSource(source, "1.0.0", "beta");
        await runCli(["release", "--all"], {
            environment: { ULVIA_DATA_DIR: data },
            cwd: source,
            repositoryFetch: emptyRemote,
            releaseVerifier: { verify: async () => undefined },
            log: () => undefined,
        });
        const inspected: string[] = [];
        const output: string[] = [];

        await expect(
            runCli(["push", "--all"], {
                environment: {
                    ULVIA_DATA_DIR: data,
                    ULVIA_URL: "https://manager.example.test",
                    ULVIA_TOKEN: "pat-not-logged",
                },
                repositoryFetch: emptyRemote,
                publicationFetch: async (input) => {
                    inspected.push(new URL(input instanceof Request ? input.url : input).searchParams.get("kind")!);
                    return Response.json({ code: "integration_version_exists" }, { status: 409 });
                },
                log: (line) => output.push(line),
            }),
        ).rejects.toThrow(/alpha@1.0.0.*conflict/);

        expect(inspected).toEqual(["alpha"]);
        expect(output.at(-1)).toContain("failed=1 skipped=1");
        expect(output.join("\n")).not.toContain("pat-not-logged");
        const paths = resolveUlviaPaths({ ULVIA_DATA_DIR: data });
        const local = new LocalIntegrationRepository(paths.repository, paths.packages);
        await local.init();
        const records = await local.list();
        expect(records.find((record) => record.kind === "alpha")?.admission).toMatchObject({
            status: "rejected",
            code: "integration_version_exists",
        });
        expect(records.find((record) => record.kind === "beta")?.admission).toBeUndefined();
    });

    test("push --all selects only the latest local release for each integration", async () => {
        const root = await temporaryRoot(roots);
        const source = join(root, "source");
        const data = join(root, "data");
        const baseOptions = {
            environment: { ULVIA_DATA_DIR: data },
            cwd: source,
            repositoryFetch: emptyRemote,
            releaseVerifier: { verify: async () => undefined },
            log: () => undefined,
        };
        await writeIntegrationSource(source, "1.0.0", "demo");
        await runCli(["release", "demo"], baseOptions);
        await writeIntegrationSource(source, "1.1.0", "demo");
        await runCli(["release", "demo"], baseOptions);

        const paths = resolveUlviaPaths(baseOptions.environment);
        const local = new LocalIntegrationRepository(paths.repository, paths.packages);
        await local.init();
        const latest = (await local.list()).find((record) => record.kind === "demo" && record.version === "1.1.0")!;
        const resolved = await local.getPackage(latest);
        const submitted: string[] = [];

        await runCli(["push", "--all"], {
            environment: {
                ULVIA_DATA_DIR: data,
                ULVIA_URL: "https://manager.example.test",
                ULVIA_TOKEN: "pat-not-logged",
            },
            repositoryFetch: remoteFixture(resolved),
            publicationFetch: async (input, init) => {
                const request = new Request(input, init);
                if (request.method === "GET") {
                    return Response.json({ kind: "demo", versions: [] });
                }
                const candidate = await validateIntegrationCandidateEnvelope(await request.json());
                submitted.push(`${candidate.envelope.package.kind}@${candidate.envelope.package.version}`);
                return candidateResponse(candidate, "published", 202);
            },
            log: () => undefined,
        });

        expect(submitted).toEqual(["demo@1.1.0"]);
    });
});

function candidateResponse(
    candidate: Awaited<ReturnType<typeof validateIntegrationCandidateEnvelope>>,
    status: string,
    responseStatus: number,
): Response {
    return Response.json(
        {
            candidate: {
                candidateId: "candidate-1",
                status,
                kind: candidate.envelope.package.kind,
                version: candidate.envelope.package.version,
                candidateDigest: candidate.candidateDigest,
                packageDigest: candidate.packageDigest,
                verificationDigest: candidate.verificationDigest,
            },
        },
        { status: responseStatus },
    );
}
