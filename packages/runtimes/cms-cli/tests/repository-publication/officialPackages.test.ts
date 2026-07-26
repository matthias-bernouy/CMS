import { afterEach, describe, expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import { buildOfficialIntegrationPackages } from "@bernouy/cms-official-integrations/publication";

const EXPECTED_KINDS = [
    "ban",
    "basic-blocs",
    "commerce",
    "commerce-mondial-relay-delivery",
    "commerce-mondial-relay-fulfillment",
    "commerce-negotiation",
    "commerce-stripe-payments",
    "emailer",
    "mondial-relay",
    "newsletter",
    "photo-albums",
    "sales-configurator",
    "stripe-connect",
    "user-account",
] as const;

const roots: string[] = [];

afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

describe("official integration publication source", () => {
    test("builds all checked-in packages deterministically in publication order", async () => {
        const first = await buildOfficialIntegrationPackages();
        const second = await buildOfficialIntegrationPackages(OFFICIAL_INTEGRATIONS_ROOT);

        expect(first.map(({ kind }) => kind)).toEqual(EXPECTED_KINDS);
        expect(first).toHaveLength(14);
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
                releaseNotes: "README.md",
            });
            expect(integrationPackage.digest).toMatch(/^[a-f0-9]{64}$/);
        }
    });

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

        await expect(buildOfficialIntegrationPackages(root)).rejects.toThrow("escapes its integration root");
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
