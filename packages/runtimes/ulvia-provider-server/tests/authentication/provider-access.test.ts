import { expect, test } from "bun:test";
import { admitProviderManifest } from "@bernouy/cms-repository/providers";
import { admitContractRelease } from "@bernouy/cms-repository/contracts";
import { validateSchemaValue } from "@bernouy/cms-repository/contracts/schema";
import { providerSite, siteId } from "../../../../features/cms-repository/tests/providers/workflows/fixtures";
import { contractDocument } from "../../../../features/cms-repository/tests/providers/support/fixtures";
import { providerAdministration } from "../../src/runtime/gateway/providers/administration";
import type { ProviderStores } from "../../src/runtime/stores/providerStores";
import type { ProviderManagement } from "@bernouy/cms-repository/providers/management";
import type { createProviderGateway } from "../../src/runtime/gateway/createProviderGateway";
type OutputSchema = Parameters<typeof validateSchemaValue>[0];
type AuthoredRequirement = { contractId: string; capabilityId: string; versionRange: string; optional: boolean };

const schemaPath = new URL(
    "../../../../official-repository/contracts/ulvia.cms.installations/capabilities/queries/get-provider-access.json",
    import.meta.url,
);

async function accessFixture(longRange?: number, manyRequirements = false) {
    const site = await providerSite();
    const document = structuredClone(manyRequirements ? site.next.manifest : site.previous.manifest) as unknown as {
        providerId: string;
        version: string;
        implementations: { contractId: string; requires: AuthoredRequirement[] }[];
    };
    if (longRange) {
        const size = (longRange - 12) / 4;
        const versionRange = [1, 2, 3, 4].map((major) => `^${major}.0.0+${"x".repeat(size - 7)}`).join(" || ");
        expect(versionRange.length).toBe(longRange);
        document.implementations.find((item) => item.contractId === "commerce")!.requires[0]!.versionRange =
            versionRange;
    }
    if (manyRequirements) {
        const dependency = contractDocument("dependency", "read-0");
        const template = (dependency.capabilities as Record<string, unknown>[])[0]!;
        dependency.capabilities = Array.from({ length: 260 }, (_, index) => ({
            ...structuredClone(template),
            id: `read.item${index}`,
            bindings: [
                {
                    id: "http",
                    transport: "http",
                    method: "POST",
                    path: `/read-${index}`,
                    input: { body: true },
                    response: { successStatuses: [200], contentTypes: ["application/json"], errorStatuses: {} },
                },
            ],
        }));
        await site.releases.publish(await admitContractRelease(dependency));
        for (const [index, item] of document.implementations.entries()) {
            item.requires.push(
                ...Array.from({ length: 65 }, (_, offset) => ({
                    contractId: "dependency",
                    capabilityId: `read.item${index * 65 + offset}`,
                    versionRange: "^1.0.0",
                    optional: false,
                })),
            );
        }
    }
    const admission = await admitProviderManifest(document, site.releases);
    const stored = {
        revision: 3,
        installation: {
            id: "source",
            providerId: document.providerId,
            endpoint: "https://provider.example.com",
            approval: { manifestVersion: document.version, manifestDigest: admission.digest },
        },
    };
    const administration = providerAdministration(
        {
            installations: { get: async () => stored },
            manifests: { get: async () => ({ admission }) },
        } as unknown as ProviderStores,
        { siteId, routes: { resolve: async () => null } } as unknown as Awaited<
            ReturnType<typeof createProviderGateway>
        >,
        {} as ProviderManagement,
        "https://cms.example.com",
    );
    const definition = (await Bun.file(schemaPath).json()) as { output: OutputSchema };
    return { result: await administration.access("source"), output: definition.output };
}

test.each([156, 256])("provider access returns admitted %i-character version ranges", async (length) => {
    const { result, output } = await accessFixture(length);
    expect(result.requests.some((item) => item.versionRange.length === length)).toBe(true);
    expect(() => validateSchemaValue(output, result)).not.toThrow();
});

test("provider access validates the combined requirements of multiple admitted implementations", async () => {
    const { result, output } = await accessFixture(undefined, true);
    expect(result.requests.length).toBeGreaterThan(256);
    expect(result.requests.every((item) => !item.selected)).toBe(true);
    expect(() => validateSchemaValue(output, result)).not.toThrow();
});
