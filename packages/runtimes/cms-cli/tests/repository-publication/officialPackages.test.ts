import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import {
    buildOfficialIntegrationCandidates,
    buildOfficialIntegrationPackages,
    OFFICIAL_CANDIDATE_RUNNER_REQUIREMENT,
} from "@bernouy/cms-official-integrations/publication";

const EXPECTED_COORDINATES = [
    "ban@1.0.0",
    "basic-blocs@1.0.0",
    "commerce@1.0.0",
    "commerce@1.1.0",
    "commerce-mondial-relay-delivery@1.0.0",
    "commerce-mondial-relay-fulfillment@1.0.0",
    "commerce-negotiation@1.0.0",
    "commerce-stripe-payments@1.0.0",
    "consent@1.0.0",
    "documentation-blocs@1.0.0",
    "emailer@1.0.0",
    "forms@1.0.0",
    "mondial-relay@1.0.0",
    "newsletter@1.0.0",
    "photo-albums@1.0.0",
    "photo-albums@1.1.0",
    "photo-albums@1.2.0",
    "photo-albums@2.0.0",
    "restaurant@1.0.0",
    "sales-configurator@1.0.0",
    "stripe-connect@1.0.0",
    "user-account@1.0.0",
    "workspace-blocs@1.0.0",
] as const;
const PUBLICATION_TEST_TIMEOUT = 15_000;

const roots: string[] = [];

afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("official integration publication source", () => {
    test(
        "builds all checked-in packages deterministically in publication order",
        async () => {
            const first = await buildOfficialIntegrationPackages();
            const second = await buildOfficialIntegrationPackages(OFFICIAL_INTEGRATIONS_ROOT);

            expect(first.map(({ kind, version }) => `${kind}@${version}`)).toEqual(EXPECTED_COORDINATES);
            expect(first).toHaveLength(EXPECTED_COORDINATES.length);
            const identity = ({ kind, version, digest, canonicalBytes }: (typeof first)[number]) => ({
                kind,
                version,
                digest,
                canonicalBytes,
            });
            expect(first.map(identity)).toEqual(second.map(identity));
            for (const integrationPackage of first) {
                const envelope = JSON.parse(new TextDecoder().decode(integrationPackage.canonicalBytes));
                expect(envelope).toMatchObject({
                    schema: "cms.integration.package.v1",
                    kind: integrationPackage.kind,
                    version: integrationPackage.version,
                });
                expect(typeof envelope.releaseNotes).toBe("string");
                expect(envelope.files[envelope.releaseNotes]).toMatchObject({ encoding: "utf8" });
                expect(integrationPackage.digest).toMatch(/^[a-f0-9]{64}$/);
            }
        },
        PUBLICATION_TEST_TIMEOUT,
    );

    test(
        "binds every official package to a deterministic candidate verification policy",
        async () => {
            const first = await buildOfficialIntegrationCandidates();
            const second = await buildOfficialIntegrationCandidates(OFFICIAL_INTEGRATIONS_ROOT);

            expect(first).toEqual(second);
            expect(first.map(({ kind, version }) => `${kind}@${version}`)).toEqual(EXPECTED_COORDINATES);
            for (const candidate of first) {
                const envelope = JSON.parse(new TextDecoder().decode(candidate.canonicalBytes));
                expect(envelope).toMatchObject({
                    schema: "cms.integration.candidate.v1",
                    package: { kind: candidate.kind, version: candidate.version },
                    verification: {
                        target: {
                            kind: candidate.kind,
                            version: candidate.version,
                            packageDigest: candidate.packageDigest,
                        },
                        manifest: {
                            runnerRequirements: [OFFICIAL_CANDIDATE_RUNNER_REQUIREMENT],
                        },
                    },
                    submission: { requestedChannel: "latest" },
                });
                expect(candidate.candidateDigest).toMatch(/^[a-f0-9]{64}$/u);
                expect(candidate.verificationDigest).toMatch(/^[a-f0-9]{64}$/u);
            }
        },
        PUBLICATION_TEST_TIMEOUT,
    );

    test("rejects index paths escaping their integration root", async () => {
        const root = await temporaryRoot();
        const integration = join(root, "domains", "unsafe");
        await mkdir(integration, { recursive: true });
        await writeFile(
            join(integration, "integration.json"),
            JSON.stringify({
                kind: "unsafe",
                label: "Unsafe",
                stable: "1.0.0",
                latest: "1.0.0",
                versions: [{ version: "1.0.0", path: "../../outside", definition: "../../definition.json" }],
            }),
        );

        await expect(buildOfficialIntegrationPackages(root)).rejects.toThrow("escapes its root");
    });

    test("rejects symlinks during source discovery", async () => {
        const root = await temporaryRoot();
        const external = await temporaryRoot();
        await mkdir(join(root, "domains"));
        await symlink(external, join(root, "domains", "linked"));

        await expect(buildOfficialIntegrationPackages(root)).rejects.toThrow("must not follow symlinks");
    });
});

async function temporaryRoot(): Promise<string> {
    const root = await mkdtemp(join(tmpdir(), "cms-cli-official-packages-"));
    roots.push(root);
    return root;
}
