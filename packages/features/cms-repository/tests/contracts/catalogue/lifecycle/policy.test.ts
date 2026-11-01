import { expect, test } from "bun:test";
import { admitContractRelease } from "@bernouy/cms-repository/contracts";
import {
    InMemoryReleaseCatalogue,
    planContractPublications,
    publishContractSet,
} from "@bernouy/cms-repository/contracts/catalogue";
import { MongoReleaseCatalogue } from "@bernouy/cms-repository/contracts/mongo";
import { fakeCatalogueDb } from "../../../support/fakeCatalogueDb";
import { capabilityDocument, contractDocument, objectSchema, stringSchema } from "../../support/fixtures";

const oldId = "email.message.send";
const newId = "email.message.deliver";
const original = () => capabilityDocument();
const successor = () =>
    capabilityDocument({
        id: newId,
        bindings: [{ transport: "http", method: "POST", path: "/v1/deliver", input: { body: true } }],
    });
const release = (version: string, capabilities = [original()]) =>
    admitContractRelease(contractDocument({ version, capabilities }));
const transition = () => release("1.1.0", [capabilityDocument({ deprecation: { replacedBy: newId } }), successor()]);

test.each(["memory", "mongo"])(
    "%s catalogue refuses a breaking identity even across a major and leaves state unchanged",
    async (adapter) => {
        const db = fakeCatalogueDb();
        const catalogue = adapter === "mongo" ? new MongoReleaseCatalogue(db) : new InMemoryReleaseCatalogue();
        await catalogue.publish(await release("1.0.0"));
        const mutations = [
            capabilityDocument({ input: objectSchema({ recipient: stringSchema(100) }, ["recipient"]) }),
            capabilityDocument({ output: objectSchema({ other: stringSchema() }, ["other"]) }),
            capabilityDocument({ access: "public" }),
            capabilityDocument({
                errors: [],
                bindings: [
                    {
                        transport: "http",
                        method: "POST",
                        path: "/v1/messages",
                        input: { body: true },
                        response: { errorStatuses: {} },
                    },
                ],
            }),
            capabilityDocument({
                bindings: [{ transport: "http", method: "POST", path: "/different", input: { body: true } }],
            }),
        ];
        for (const capability of mutations) {
            const rejected = await release("2.0.0", [capability]);
            await expect(catalogue.publish(rejected)).rejects.toThrow("new capability");
            expect(await catalogue.get("communication.email", "2.0.0")).toBeNull();
        }
        expect(await catalogue.list()).toHaveLength(1);
        if (adapter === "mongo") {
            expect(await db.collection("cms_contract_artifacts").find({}).toArray()).toHaveLength(1);
        }
    },
);
test("optional output fields cannot disappear under a stable capability identity", async () => {
    const catalogue = new InMemoryReleaseCatalogue();
    await catalogue.publish(
        await release("1.0.0", [
            capabilityDocument({
                output: objectSchema({ messageId: stringSchema(), details: objectSchema({ reason: stringSchema() }) }, [
                    "messageId",
                ]),
            }),
        ]),
    );
    for (const version of ["1.1.0", "2.0.0"]) {
        await expect(catalogue.publish(await release(version))).rejects.toThrow();
    }
});
test("deprecation precedes major removal, preserves the replacement and prevents identifier recycling", async () => {
    const catalogue = new InMemoryReleaseCatalogue();
    await catalogue.publish(await release("1.0.0"));
    await expect(catalogue.publish(await release("2.0.0", [successor()]))).rejects.toThrow(
        "previously published deprecation",
    );
    await catalogue.publish(await transition());
    await expect(catalogue.publish(await release("1.2.0", [successor()]))).rejects.toThrow();
    await catalogue.publish(await release("2.0.0", [successor()]));
    await expect(catalogue.publish(await release("3.0.0", [original(), successor()]))).rejects.toThrow(
        "cannot be reused",
    );
    expect((await catalogue.get("communication.email", "1.0.0"))?.admission.release.capabilities[0]?.id).toBe(oldId);
});
test("a preview cannot bypass a stable capability or replace a published deprecation", async () => {
    const catalogue = new InMemoryReleaseCatalogue();
    await catalogue.publish(await release("1.0.0"));
    await expect(
        catalogue.publish(await release("2.0.0-alpha.1", [capabilityDocument({ access: "public" })])),
    ).rejects.toThrow("stable");
    await catalogue.publish(
        await release("1.1.0-alpha.1", [capabilityDocument({ deprecation: { replacedBy: newId } }), successor()]),
    );
    await expect(catalogue.publish(await release("2.0.0", [successor()]))).rejects.toThrow(
        "previously published deprecation",
    );
});
test("publication sets validate the entire lifecycle before their first write", async () => {
    const catalogue = new InMemoryReleaseCatalogue();
    await expect(
        publishContractSet(catalogue, [await release("1.0.0"), await release("2.0.0", [successor()])]),
    ).rejects.toThrow();
    expect(await catalogue.list()).toEqual([]);
    const ordered = await planContractPublications(catalogue, [
        await release("2.0.0", [successor()]),
        await transition(),
        await release("1.0.0"),
    ]);
    expect(ordered.map(({ release: value }) => value.version)).toEqual(["1.0.0", "1.1.0", "2.0.0"]);
    await publishContractSet(catalogue, ordered);
    await expect(
        catalogue.publish(
            await release("1.1.1", [capabilityDocument({ deprecation: { replacedBy: newId } }), successor()]),
        ),
    ).resolves.toBeDefined();
});
