import { afterEach, describe, expect, test } from "bun:test";
import { join } from "node:path";
import { runCli } from "../../src/cli";
import { RemoteIntegrationRepository } from "../../src/repository/remote";
import { integrationPackage, removeReadonlyTree, writeIntegrationSource } from "../fixtures";
import { emptyRemote, remoteFixture, temporaryRoot } from "./support";

const roots: string[] = [];
afterEach(async () => {
    await Promise.all(roots.splice(0).map(removeReadonlyTree));
});

describe("Ulvia CLI", () => {
    test("pulls the remote default once and reports it locally", async () => {
        const root = await temporaryRoot(roots);
        const resolved = await integrationPackage();
        const environment = {
            ULVIA_DATA_DIR: root,
            ULVIA_REPOSITORY_URL: "http://repository.example.test/.cms/repository",
        };
        const output: string[] = [];
        const repositoryFetch = remoteFixture(resolved);
        await runCli(["pull", "demo"], { environment, repositoryFetch, log: (line) => output.push(line) });
        await runCli(["pull", "demo"], { environment, repositoryFetch, log: (line) => output.push(line) });
        await runCli(["status"], { environment, log: (line) => output.push(line) });

        expect(output).toEqual(
            expect.arrayContaining([
                expect.stringContaining("+ demo@1.0.0"),
                expect.stringContaining("already exists"),
            ]),
        );
        expect(output.at(-1)).toContain("demo@1.0.0");
    });

    test("push requires a locally released integration", async () => {
        const root = await temporaryRoot(roots);
        await expect(
            runCli(["push", "demo"], {
                environment: { ULVIA_DATA_DIR: root },
            }),
        ).rejects.toThrow(/no local release/);
    });

    test("keeps unverified coordinates out of pullable version lists", async () => {
        const remote = new RemoteIntegrationRepository("http://repository.example.test/.cms/repository", async () =>
            Response.json([
                { version: "1.0.0", path: "versions/1.0.0", definition: "definition.json" },
                {
                    version: "1.1.0",
                    path: "versions/1.1.0",
                    definition: "definition.json",
                    status: "unverified",
                },
            ]),
        );

        expect(await remote.versions("demo")).toEqual(["1.0.0"]);
        expect(await remote.versionEntries("demo")).toHaveLength(2);
    });

    test("releases every changed source and skips unchanged local coordinates", async () => {
        const root = await temporaryRoot(roots);
        const source = join(root, "source");
        await writeIntegrationSource(source, "1.0.0", "alpha");
        await writeIntegrationSource(source, "1.0.0", "beta");
        const verified: string[] = [];
        const options = {
            environment: { ULVIA_DATA_DIR: join(root, "data") },
            cwd: source,
            repositoryFetch: emptyRemote,
            releaseVerifier: {
                verify: async ({ candidate }: { candidate: { package: { envelope: { kind: string } } } }) => {
                    verified.push(candidate.package.envelope.kind);
                },
            },
            log: () => undefined,
        };

        await runCli(["release", "--all"], options);
        await runCli(["release", "--all"], options);

        expect(verified).toEqual(["alpha", "beta"]);
        const catalog = await Bun.file(join(root, "data", "repository", "catalog.json")).json();
        expect(catalog.packages.map(({ kind }: { kind: string }) => kind)).toEqual(["alpha", "beta"]);
    });
});
