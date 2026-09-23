import { describe, expect, test } from "bun:test";
import { admitContractRelease, DEFAULT_RELEASE_LIMITS } from "@bernouy/cms-contracts";
import { InMemoryReleaseCatalogue } from "@bernouy/cms-contracts/catalogue";
import { capabilityDocument, contractDocument, objectSchema, stringSchema } from "../support/fixtures";

describe("InMemoryReleaseCatalogue", () => {
    test("publishes and resolves only admitted immutable releases", async () => {
        const catalogue = new InMemoryReleaseCatalogue();
        const admission = await admitContractRelease(contractDocument({ version: "1.0.0" }));

        const published = await catalogue.publish(admission);

        expect(await catalogue.get("communication.email", "1.0.0")).toBe(published);
        expect(await catalogue.findByDigest(admission.digest)).toBe(published);
        expect(await catalogue.publish(admission)).toBe(published);
    });

    test("rejects an admitted artifact whose integrity fields were forged", async () => {
        const catalogue = new InMemoryReleaseCatalogue();
        const admission = await admitContractRelease(contractDocument({ version: "1.0.0" }));

        await expect(catalogue.publish({ ...admission, canonicalJson: "{}" })).rejects.toThrow(
            "failed integrity verification",
        );
    });

    test("revalidates publications with the catalogue limits", async () => {
        const limits = { ...DEFAULT_RELEASE_LIMITS, maxStringLength: 10_000 };
        const capability = capabilityDocument({
            input: objectSchema({ value: stringSchema(10_000) }, ["value"]),
        });
        const admission = await admitContractRelease(
            contractDocument({ version: "1.0.0", capabilities: [capability] }),
            limits,
        );

        await expect(new InMemoryReleaseCatalogue().publish(admission)).rejects.toThrow("must be between 0 and 8192");
        await expect(new InMemoryReleaseCatalogue(limits).publish(admission)).resolves.toMatchObject({
            admission: { digest: admission.digest },
        });
    });

    test("rejects an insufficient version bump", async () => {
        const catalogue = new InMemoryReleaseCatalogue();
        await catalogue.publish(await admitContractRelease(contractDocument({ version: "1.0.0" })));
        const changed = capabilityDocument({
            input: objectSchema({ recipient: stringSchema(100), templateId: stringSchema(64) }, [
                "recipient",
                "templateId",
            ]),
        });
        const incompatible = await admitContractRelease(
            contractDocument({ version: "1.1.0", capabilities: [changed] }),
        );

        await expect(catalogue.publish(incompatible)).rejects.toThrow(
            "major change declared with a minor version bump",
        );
    });

    test("maintains an older major release line after a newer major exists", async () => {
        const catalogue = new InMemoryReleaseCatalogue();
        await catalogue.publish(await admitContractRelease(contractDocument({ version: "1.0.0" })));
        await catalogue.publish(await admitContractRelease(contractDocument({ version: "2.0.0" })));

        await expect(
            catalogue.publish(await admitContractRelease(contractDocument({ version: "1.0.1" }))),
        ).resolves.toMatchObject({ admission: { release: { version: "1.0.1" } } });
    });

    test("does not let a newer prerelease block stable maintenance", async () => {
        const catalogue = new InMemoryReleaseCatalogue();
        await catalogue.publish(await admitContractRelease(contractDocument({ version: "1.0.0" })));
        await catalogue.publish(await admitContractRelease(contractDocument({ version: "1.1.0-alpha.1" })));

        await expect(
            catalogue.publish(await admitContractRelease(contractDocument({ version: "1.0.1" }))),
        ).resolves.toMatchObject({ admission: { release: { version: "1.0.1" } } });
    });

    test("does not reopen stable maintenance behind a newer stable release", async () => {
        const catalogue = new InMemoryReleaseCatalogue();
        await catalogue.publish(await admitContractRelease(contractDocument({ version: "1.0.0" })));
        await catalogue.publish(await admitContractRelease(contractDocument({ version: "1.1.0" })));

        await expect(
            catalogue.publish(await admitContractRelease(contractDocument({ version: "1.0.1" }))),
        ).rejects.toThrow("next release version must increase");
    });

    test("keeps publisher ownership stable across major release lines", async () => {
        const catalogue = new InMemoryReleaseCatalogue();
        await catalogue.publish(await admitContractRelease(contractDocument({ version: "1.0.0" })));
        const nextMajor = await admitContractRelease(
            contractDocument({
                version: "2.0.0",
                publisherId: "third.party",
            }),
        );

        await expect(catalogue.publish(nextMajor)).rejects.toThrow(
            "publisher ownership cannot change between releases",
        );
    });

    test("uses configured JSON depth limits during compatibility checks", async () => {
        const limits = { ...DEFAULT_RELEASE_LIMITS, maxJsonDepth: 100, maxSchemaDepth: 40 };
        const deeplyNestedInput = nestedObjectSchema(32);
        const catalogue = new InMemoryReleaseCatalogue(limits);
        await catalogue.publish(
            await admitContractRelease(
                contractDocument({
                    version: "1.0.0",
                    capabilities: [capabilityDocument({ input: deeplyNestedInput })],
                }),
                limits,
            ),
        );

        await expect(
            catalogue.publish(
                await admitContractRelease(
                    contractDocument({
                        version: "1.0.1",
                        capabilities: [capabilityDocument({ input: deeplyNestedInput })],
                    }),
                    limits,
                ),
            ),
        ).resolves.toMatchObject({ admission: { release: { version: "1.0.1" } } });
    });

    test("updates release deprecation without changing the release digest", async () => {
        const publishedAt = "2026-09-23T12:30:00.000Z";
        const catalogue = new InMemoryReleaseCatalogue(DEFAULT_RELEASE_LIMITS, () => new Date(publishedAt));
        const first = await catalogue.publish(await admitContractRelease(contractDocument({ version: "1.0.0" })));
        expect(first.publishedAt).toBe(publishedAt);
        expect(Object.hasOwn(first.admission.release, "publishedAt")).toBe(false);
        await catalogue.publish(await admitContractRelease(contractDocument({ version: "2.0.0" })));

        const updated = await catalogue.setDeprecation("communication.email", "1.0.0", {
            replacedByVersion: "2.0.0",
            sunsetAt: "2027-01-01T00:00:00Z",
        });

        expect(updated.deprecation?.replacedByVersion).toBe("2.0.0");
        expect(updated.admission.digest).toBe(first.admission.digest);
        expect(updated.publishedAt).toBe(publishedAt);
    });
});

function nestedObjectSchema(depth: number): Record<string, unknown> {
    let schema: Record<string, unknown> = stringSchema(32);
    for (let level = 0; level < depth; level += 1) {
        schema = objectSchema({ nested: schema }, ["nested"]);
    }
    return schema;
}
