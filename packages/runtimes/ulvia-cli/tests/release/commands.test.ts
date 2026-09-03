import { describe, expect, test } from "bun:test";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { runCli } from "../../src/cli";
import type { LocalReleaseVerifier } from "../../src/release/types";
import { integrationDefinition, writeIntegrationSource } from "../fixtures";
import { emptyRemote, temporaryRoot } from "./support";

describe("local integration release commands", () => {
    test("audits without storing, then verifies before storing a release", async () => {
        const root = await temporaryRoot();
        const source = join(root, "source");
        const data = join(root, "data");
        const definitionPath = await writeIntegrationSource(source, "1.0.0");
        let verifications = 0;
        const verifier: LocalReleaseVerifier = {
            verify: async ({ candidate, baselines }) => {
                verifications += 1;
                expect(candidate.package.envelope.kind).toBe("demo");
                expect(baselines).toEqual([]);
            },
        };
        const options = {
            environment: { ULVIA_DATA_DIR: data },
            cwd: source,
            repositoryFetch: emptyRemote,
            releaseVerifier: verifier,
            log: () => undefined,
        };

        await runCli(["audit", "demo"], options);
        expect(verifications).toBe(1);
        expect(await Bun.file(join(data, "repository", "catalog.json")).exists()).toBeFalse();
        await runCli(["release", "demo"], options);
        await runCli(["release", "demo"], options);
        expect(verifications).toBe(2);
        const catalog = await Bun.file(join(data, "repository", "catalog.json")).json();
        expect(catalog.packages).toHaveLength(1);

        await writeFile(
            definitionPath,
            JSON.stringify(integrationDefinition("demo", "1.0.0", { description: "Changed" })),
        );
        await expect(runCli(["release", "demo"], options)).rejects.toThrow(/immutable.*patch release.*demo@1\.0\.1/);
        expect(verifications).toBe(2);
    });

    test("audits every discovered source without storing candidates", async () => {
        const root = await temporaryRoot();
        const source = join(root, "source");
        const data = join(root, "data");
        await writeIntegrationSource(source, "1.0.0", "alpha");
        await writeIntegrationSource(source, "1.0.0", "beta");
        const verified: string[] = [];

        await runCli(["audit", "--all"], {
            environment: { ULVIA_DATA_DIR: data },
            cwd: source,
            repositoryFetch: emptyRemote,
            releaseVerifier: {
                verify: async ({ candidate }) => void verified.push(candidate.package.envelope.kind),
            },
            log: () => undefined,
        });

        expect(verified).toEqual(["alpha", "beta"]);
        expect(await Bun.file(join(data, "repository", "catalog.json")).exists()).toBeFalse();
    });

    test("uses pulled baselines without consulting the remote repository", async () => {
        const root = await temporaryRoot();
        const source = join(root, "source");
        const data = join(root, "data");
        await writeIntegrationSource(source, "1.0.0");
        const verifier: LocalReleaseVerifier = { verify: async () => undefined };
        const common = { environment: { ULVIA_DATA_DIR: data }, cwd: source, releaseVerifier: verifier };
        await runCli(["release", "demo"], { ...common, repositoryFetch: emptyRemote, log: () => undefined });
        await writeIntegrationSource(source, "1.1.0");
        let remoteCalls = 0;

        await runCli(["audit", "demo"], {
            ...common,
            repositoryFetch: async () => {
                remoteCalls += 1;
                throw new Error("remote repository must not be consulted");
            },
            log: () => undefined,
        });

        expect(remoteCalls).toBe(0);
    });

    test("releases dependencies before lexically earlier dependents", async () => {
        const root = await temporaryRoot();
        const source = join(root, "source");
        const data = join(root, "data");
        const dependent = await writeIntegrationSource(source, "1.0.0", "alpha");
        await writeIntegrationSource(source, "1.0.0", "zulu");
        await writeFile(
            dependent,
            JSON.stringify(
                integrationDefinition("alpha", "1.0.0", {
                    dependencies: [{ name: "provider", kind: "zulu" }],
                }),
            ),
        );
        const verified: string[] = [];

        await runCli(["release", "--all"], {
            environment: { ULVIA_DATA_DIR: data },
            cwd: source,
            repositoryFetch: emptyRemote,
            releaseVerifier: {
                verify: async ({ candidate, availablePackages }) => {
                    verified.push(candidate.package.envelope.kind);
                    if (candidate.package.envelope.kind === "alpha") {
                        expect(availablePackages.map((entry) => entry.package.envelope.kind)).toContain("zulu");
                    }
                },
            },
            log: () => undefined,
        });

        expect(verified).toEqual(["zulu", "alpha"]);
    });

    test("rejects local dependency cycles before storing any release", async () => {
        const root = await temporaryRoot();
        const source = join(root, "source");
        const data = join(root, "data");
        const alpha = await writeIntegrationSource(source, "1.0.0", "alpha");
        const beta = await writeIntegrationSource(source, "1.0.0", "beta");
        await writeFile(
            alpha,
            JSON.stringify(integrationDefinition("alpha", "1.0.0", { dependencies: [{ name: "beta", kind: "beta" }] })),
        );
        await writeFile(
            beta,
            JSON.stringify(
                integrationDefinition("beta", "1.0.0", { dependencies: [{ name: "alpha", kind: "alpha" }] }),
            ),
        );

        await expect(
            runCli(["release", "--all"], {
                environment: { ULVIA_DATA_DIR: data },
                cwd: source,
                repositoryFetch: emptyRemote,
                releaseVerifier: { verify: async () => undefined },
                log: () => undefined,
            }),
        ).rejects.toThrow(/dependency cycle includes alpha → beta → alpha/u);
        expect(await Bun.file(join(data, "repository", "catalog.json")).exists()).toBeFalse();
    });
});
