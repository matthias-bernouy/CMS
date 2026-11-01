import { expect, test } from "bun:test";
import { admitContractRelease } from "@bernouy/cms-repository/contracts";
import { compareContractReleases } from "@bernouy/cms-repository/contracts/compatibility";
import { InMemoryReleaseCatalogue, publishContractSet } from "@bernouy/cms-repository/contracts/catalogue";
import { MongoReleaseCatalogue } from "@bernouy/cms-repository/contracts/mongo";
import { fakeCatalogueDb } from "../../../support/fakeCatalogueDb";
import { capabilityDocument, contractDocument, objectSchema, stringSchema } from "../../support/fixtures";

const message = objectSchema({ message: stringSchema(100) }, ["message"]);
const extended = objectSchema(
    {
        message: stringSchema(100),
        issues: { type: "array", maxItems: 10, items: objectSchema({ reason: stringSchema(80) }, ["reason"]) },
    },
    ["message"],
);
async function release(version: string, output?: unknown, errorOverrides = {}) {
    return admitContractRelease(
        contractDocument({
            version,
            capabilities: [
                capabilityDocument({
                    errors: [
                        {
                            code: "INVALID_RECIPIENT",
                            retryable: false,
                            ...(output ? { output } : {}),
                            ...errorOverrides,
                        },
                    ],
                }),
            ],
        }),
    );
}

test("adding error details and nested fields is minor and requires a minor release", async () => {
    for (const [before, after] of [
        [undefined, message],
        [message, extended],
        [
            extended,
            {
                ...extended,
                properties: {
                    ...(extended.properties as Record<string, unknown>),
                    issues: {
                        type: "array",
                        maxItems: 10,
                        items: objectSchema({ reason: stringSchema(80), path: stringSchema(100) }, ["reason"]),
                    },
                },
            },
        ],
    ]) {
        const original = await release("1.0.0", before);
        for (const version of ["1.0.1", "1.1.0"]) {
            const next = await release(version, after);
            expect(compareContractReleases(original.release, next.release)).toMatchObject({
                consumerCompatible: true,
                requiredBump: "minor",
                validEvolution: version === "1.1.0",
            });
        }
    }
});

test.each(["memory", "mongo", "batch"])(
    "%s publication accepts additive error outputs under one identity",
    async (adapter) => {
        const db = fakeCatalogueDb();
        const catalogue = adapter === "mongo" ? new MongoReleaseCatalogue(db) : new InMemoryReleaseCatalogue();
        const releases = [await release("1.0.0"), await release("1.1.0", message), await release("1.2.0", extended)];
        if (adapter === "batch") {
            await publishContractSet(catalogue, releases.toReversed());
        } else {
            for (const candidate of releases) {
                await catalogue.publish(candidate);
            }
        }
        expect(await catalogue.list()).toHaveLength(3);
        await catalogue.publish(await release("1.2.1", extended));
        await expect(
            catalogue.publish(
                await release("1.2.2", {
                    ...extended,
                    properties: { ...(extended.properties as Record<string, unknown>), hint: stringSchema(100) },
                }),
            ),
        ).rejects.toThrow();
        expect(await catalogue.get("communication.email", "1.2.2")).toBeNull();
    },
);

test.each(["memory", "mongo"])("%s refuses removed or incompatible error details without writes", async (adapter) => {
    const db = fakeCatalogueDb();
    const catalogue = adapter === "mongo" ? new MongoReleaseCatalogue(db) : new InMemoryReleaseCatalogue();
    const original = await release("1.0.0", extended);
    await catalogue.publish(original);
    const mutations = [
        await release("2.0.0"),
        await release("2.0.0", message),
        await release("2.0.0", objectSchema({ message: stringSchema(200) }, ["message"])),
        await release("2.0.0", objectSchema({ message: { type: "integer" } }, ["message"])),
        await release("2.0.0", extended, { retryable: true }),
    ];
    for (const candidate of mutations) {
        expect(compareContractReleases(original.release, candidate.release).requiredBump).toBe("major");
        await expect(catalogue.publish(candidate)).rejects.toThrow("new capability");
        expect(await catalogue.get("communication.email", "2.0.0")).toBeNull();
    }
    expect(await catalogue.list()).toHaveLength(1);
    if (adapter === "mongo") {
        expect(await db.collection("cms_contract_artifacts").find({}).toArray()).toHaveLength(1);
    }
});

test("editorial error descriptions do not change runtime compatibility", async () => {
    const before = await release("1.0.0", message);
    const after = await release("1.0.1", message, { description: "Explain the recipient problem." });
    expect(compareContractReleases(before.release, after.release)).toMatchObject({
        validEvolution: true,
        consumerCompatible: true,
        requiredBump: "patch",
    });
});

test.each(["memory", "mongo"])(
    "%s checks backported error details against the newer stable identity",
    async (adapter) => {
        const db = fakeCatalogueDb();
        const catalogue = adapter === "mongo" ? new MongoReleaseCatalogue(db) : new InMemoryReleaseCatalogue();
        await catalogue.publish(await release("1.0.0"));
        await catalogue.publish(await release("2.0.0", extended));
        await catalogue.publish(await release("1.1.0", message));
        await expect(
            catalogue.publish(await release("1.2.0", objectSchema({ message: stringSchema(20) }, ["message"]))),
        ).rejects.toThrow("stable");
        expect(await catalogue.get("communication.email", "1.2.0")).toBeNull();
        expect(await catalogue.list()).toHaveLength(3);
    },
);
