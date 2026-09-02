import { afterEach, describe, expect, test } from "bun:test";
import { mkdtemp, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { canonicalJsonBytes, sha256Hex, validateIntegrationPackageEnvelope } from "@bernouy/cms-integration-packages";
import { parseIntegrationDefinition } from "@bernouy/cms-integrations";
import { runCli } from "../src/cli";
import { assertLocalCompatibility, evaluateLocalCompatibility } from "../src/release/compatibility";
import { sandboxAnswers } from "../src/release/sandbox/answers";
import type { LocalReleasePackage, LocalReleaseVerifier } from "../src/release/types";
import {
    integrationDefinition,
    removeReadonlyTree,
    writeDirectIntegrationSource,
    writeIntegrationSource,
} from "./fixtures";

const roots: string[] = [];
afterEach(async () => {
    await Promise.all(roots.splice(0).map(removeReadonlyTree));
});

describe("local integration releases", () => {
    test("synthesizes non-secret and secret answers required by a release sandbox", () => {
        const definition = parseIntegrationDefinition(
            integrationDefinition("demo", "1.0.0", {
                inputs: [
                    { name: "id", label: "Id", type: "text", required: true, defaultValue: "demo" },
                    { name: "account", label: "Account", type: "text", required: true },
                    { name: "apiSecret", label: "Secret", type: "password", required: true, secret: true },
                    {
                        name: "stripeSecretKey",
                        label: "Stripe secret",
                        type: "password",
                        required: true,
                        secret: true,
                    },
                    { name: "termsHash", label: "Hash", type: "text", required: true },
                    {
                        name: "region",
                        label: "Region",
                        type: "select",
                        required: true,
                        options: [{ label: "France", value: "fr" }],
                    },
                    { name: "optional", label: "Optional", type: "text" },
                ],
            }),
        );

        expect(sandboxAnswers(definition)).toEqual({
            account: "ulvia-audit-account",
            apiSecret: "ulvia-audit-apiSecret-secret",
            stripeSecretKey: "sk_test_ulvia_audit",
            termsHash: "a".repeat(64),
            region: "fr",
        });

        expect(
            sandboxAnswers(
                parseIntegrationDefinition(
                    integrationDefinition("consent", "1.0.0", {
                        inputs: [{ name: "enabled", label: "Enabled", type: "boolean", defaultValue: true }],
                    }),
                ),
            ),
        ).toEqual({ enabled: false });
    });

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
            environment: {
                ULVIA_DATA_DIR: data,
                ULVIA_REPOSITORY_URL: "http://repository.example.test/.cms/repository",
            },
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
        expect(catalog.packages[0]).toMatchObject({ kind: "demo", version: "1.0.0" });

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
            environment: {
                ULVIA_DATA_DIR: data,
                ULVIA_REPOSITORY_URL: "http://repository.example.test/.cms/repository",
            },
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

    test("packages a direct source tree from a workspace containing unrelated symlinks", async () => {
        const root = await temporaryRoot();
        const source = join(root, "source");
        await writeDirectIntegrationSource(source);
        await symlink(root, join(source, "workspace-link"), "dir");
        let files: readonly string[] = [];

        await runCli(["audit", "demo"], {
            environment: {
                ULVIA_DATA_DIR: join(root, "data"),
                ULVIA_REPOSITORY_URL: "http://repository.example.test/.cms/repository",
            },
            cwd: source,
            repositoryFetch: emptyRemote,
            releaseVerifier: {
                verify: async ({ candidate }) => {
                    files = Object.keys(candidate.package.envelope.files);
                },
            },
            log: () => undefined,
        });

        expect(files).toEqual(["definition.json", "release-notes.txt"]);
    });

    test("rejects a breaking patch before runtime verification", async () => {
        const baseline = await releasePackage("1.0.0");
        const candidate = await releasePackage("1.0.1", {
            inputs: [{ name: "account", label: "Account", type: "text", required: true }],
        });
        const result = evaluateLocalCompatibility(candidate, [baseline]);

        expect(result).toMatchObject({ contractAdmissible: false, requiredReleaseLevel: "major" });
        expect(() => assertLocalCompatibility(result)).toThrow(/requires a major version/);
    });
});

async function temporaryRoot(): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), "ulvia-release-test-"));
    roots.push(root);
    return root;
}

async function releasePackage(version: string, overrides: Record<string, unknown> = {}): Promise<LocalReleasePackage> {
    const parsed = parseIntegrationDefinition(integrationDefinition("demo", version, overrides));
    const envelope = validateIntegrationPackageEnvelope({
        schema: "cms.integration.package.v1",
        kind: "demo",
        version,
        definition: "definition.json",
        files: { "definition.json": { encoding: "utf8", content: JSON.stringify(parsed) } },
    });
    const canonicalBytes = canonicalJsonBytes(envelope);
    return { package: { envelope, canonicalBytes, digest: await sha256Hex(canonicalBytes) }, definition: parsed };
}

const emptyRemote: typeof fetch = async () => Response.json({ error: "not found" }, { status: 404 });
