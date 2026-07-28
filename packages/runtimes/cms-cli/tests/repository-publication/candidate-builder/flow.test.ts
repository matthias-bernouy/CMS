import { afterEach, describe, expect, test } from "bun:test";
import { readFile, rm, symlink } from "node:fs/promises";
import { join } from "node:path";
import { decodeIntegrationPackageFile } from "@bernouy/cms-integration-packages";
import { parseIntegrationCandidateEnvelope } from "@bernouy/cms-integration-verification";
import { buildIntegrationCandidates } from "../../../src/repositoryPublication/candidate/build";
import { verificationBundleRelativePath } from "../../../src/repositoryPublication/candidate/verification";
import {
    cleanupTemporaryRoots,
    integrationRoot,
    temporaryRoot,
    writeIntegration,
    writeText,
    writeVerification,
} from "./support";

afterEach(cleanupTemporaryRoots);

describe("generic integration candidate builder", () => {
    test("builds every declared version deterministically in ascending SemVer order", async () => {
        const root = await integrationRoot(["1.1.0", "1.0.0"]);
        const first = await buildIntegrationCandidates(root);
        const second = await buildIntegrationCandidates(root);

        expect(first.map(({ version }) => version)).toEqual(["1.0.0", "1.1.0"]);
        expect(first).toEqual(second);
        for (const built of first) {
            const candidate = await parseIntegrationCandidateEnvelope(built.canonicalBytes);
            expect(candidate).toMatchObject({
                packageDigest: built.packageDigest,
                verificationDigest: built.verificationDigest,
                candidateDigest: built.candidateDigest,
                envelope: {
                    package: { kind: "demo", version: built.version },
                    verification: {
                        manifest: {
                            runnerRequirements: [{ name: "cms-postgres", versionRange: "^1.0.0" }],
                            contracts: [],
                            conformance: [{ suiteId: "implementation", entrypoint: "suites/implementation.ts" }],
                            fixtures: [],
                        },
                    },
                    submission: { requestedChannel: "latest" },
                },
            });
            const files = candidate.envelope.package.files;
            expect(decodeIntegrationPackageFile(files["connectors/supabase/sql/schema.sql"]!)).toEqual(
                new TextEncoder().encode(`select '${built.version}';\n`),
            );
            expect(files["assets/payload.bin"]).toEqual({ encoding: "base64", content: "/wA=" });
            expect(files[verificationBundleRelativePath(built.version)]).toBeUndefined();
            expect(candidate.envelope.verification.files["suites/implementation.ts"]).toBeDefined();
        }
    });

    test("rejects a managed version without release notes", async () => {
        const root = await integrationRoot(["1.0.0"]);
        await rm(join(root, "versions/1.0.0/README.md"));

        await expect(buildIntegrationCandidates(root)).rejects.toThrow("Release notes are required for version 1.0.0");
    });

    test("requires exactly one integration in the selected source", async () => {
        const parent = await temporaryRoot();
        await writeIntegration(join(parent, "first"), "first", ["1.0.0"]);
        await writeIntegration(join(parent, "second"), "second", ["1.0.0"]);

        await expect(buildIntegrationCandidates(parent)).rejects.toThrow("exactly one integration");
    });

    test("refuses a symlinked integration root", async () => {
        const root = await integrationRoot(["1.0.0"]);
        const parent = await temporaryRoot();
        const linkedRoot = join(parent, "demo-link");
        await symlink(root, linkedRoot, "dir");

        await expect(buildIntegrationCandidates(linkedRoot)).rejects.toThrow("non-symlink integration repository");
    });

    test("does not treat runtime package test files as author verification suites", async () => {
        const root = await integrationRoot(["1.0.0"]);
        await writeText(join(root, "versions/1.0.0/tests/runtime.test.ts"), "export default true;\n");
        await rm(join(root, verificationBundleRelativePath("1.0.0")));

        await expect(buildIntegrationCandidates(root)).rejects.toThrow(
            "Verification bundle verification/1.0.0.json must be",
        );
    });

    test("accepts human-formatted source JSON and canonicalizes the uploaded candidate", async () => {
        const root = await integrationRoot(["1.0.0"]);
        const path = join(root, verificationBundleRelativePath("1.0.0"));
        const envelope = JSON.parse(await readFile(path, "utf8"));
        await writeText(path, `${JSON.stringify(envelope, null, 2)}\n`);

        const [candidate] = await buildIntegrationCandidates(root);
        expect(candidate?.canonicalBytes.at(-1)).not.toBe("\n".charCodeAt(0));
        expect(await parseIntegrationCandidateEnvelope(candidate!.canonicalBytes)).toMatchObject({
            packageDigest: candidate!.packageDigest,
            verificationDigest: candidate!.verificationDigest,
        });
    });

    test("requires an executable author suite and the platform runner requirement", async () => {
        const root = await integrationRoot(["1.0.0"]);
        await writeVerification(root, "demo", "1.0.0", { conformance: [], files: {} });
        await expect(buildIntegrationCandidates(root)).rejects.toThrow("must declare at least one author");

        await writeVerification(root, "demo", "1.0.0", {
            runnerRequirements: [{ name: "custom-runner", versionRange: "^1.0.0" }],
        });
        await expect(buildIntegrationCandidates(root)).rejects.toThrow("must require cms-postgres");
    });

    test("validates author suite sources and the exact package binding", async () => {
        const root = await integrationRoot(["1.0.0"]);
        const digest = await writeVerification(root, "demo", "1.0.0", {
            source: 'import "node:fs"; export default {};\n',
        });
        await expect(buildIntegrationCandidates(root)).rejects.toThrow("invalid_reference");

        await writeVerification(root, "demo", "1.0.0", { packageDigest: "f".repeat(64) });
        await expect(buildIntegrationCandidates(root)).rejects.toThrow(`package-sha256:${digest}`);
    });

    test("refuses a symlinked author verification document", async () => {
        const root = await integrationRoot(["1.0.0"]);
        const path = join(root, verificationBundleRelativePath("1.0.0"));
        const target = join(await temporaryRoot(), "outside.json");
        await writeText(target, "{}\n");
        await rm(path);
        await symlink(target, path);

        await expect(buildIntegrationCandidates(root)).rejects.toThrow("bounded, non-symlink regular file");
    });

    test("refuses a verification directory symlink escaping the integration root", async () => {
        const root = await integrationRoot(["1.0.0"]);
        const outside = await temporaryRoot();
        const verification = join(root, "verification");
        await rm(verification, { recursive: true });
        await symlink(outside, verification, "dir");

        await expect(buildIntegrationCandidates(root)).rejects.toThrow("bounded, non-symlink regular file");
    });
});
