import { expect, test } from "bun:test";
import { admitContractRelease } from "@bernouy/cms-repository/contracts";
import { InMemoryReleaseCatalogue } from "@bernouy/cms-repository/contracts/catalogue";
import { MongoReleaseCatalogue } from "@bernouy/cms-repository/contracts/mongo";
import { fakeCatalogueDb } from "../../../support/fakeCatalogueDb";
import { capabilityDocument, contractDocument } from "../../support/fixtures";

const extra = (access = "admin") =>
    capabilityDocument({
        id: "email.preview",
        access,
        bindings: [{ transport: "http", method: "POST", path: "/preview", input: { body: true } }],
    });
const release = (version: string, capabilities: unknown[]) =>
    admitContractRelease(contractDocument({ version, capabilities }));

test.each(["memory", "mongo"])("%s refuses incompatible backports without publishing an artifact", async (adapter) => {
    const db = fakeCatalogueDb();
    const catalogue = adapter === "mongo" ? new MongoReleaseCatalogue(db) : new InMemoryReleaseCatalogue();
    await catalogue.publish(await release("1.0.0", [capabilityDocument()]));
    await catalogue.publish(await release("2.0.0", [capabilityDocument(), extra()]));
    await expect(catalogue.publish(await release("1.1.0", [capabilityDocument(), extra("public")]))).rejects.toThrow(
        "stable",
    );
    expect(await catalogue.get("communication.email", "1.1.0")).toBeNull();
    expect(await catalogue.list()).toHaveLength(2);
    if (adapter === "mongo") {
        expect(await db.collection("cms_contract_artifacts").find({}).toArray()).toHaveLength(2);
    }
    await expect(catalogue.publish(await release("1.1.0", [capabilityDocument(), extra()]))).resolves.toBeDefined();
});

test("a backport is checked even when no lower release is known", async () => {
    const catalogue = new InMemoryReleaseCatalogue();
    await catalogue.publish(await release("2.0.0", [capabilityDocument(), extra()]));
    await expect(catalogue.publish(await release("1.0.0", [capabilityDocument(), extra("public")]))).rejects.toThrow(
        "stable",
    );
});

test("explicit retirement requires a stable transition before major removal and never recycles the identifier", async () => {
    const catalogue = new InMemoryReleaseCatalogue();
    await catalogue.publish(await release("1.0.0", [capabilityDocument(), extra()]));
    await expect(catalogue.publish(await release("2.0.0", [extra()]))).rejects.toThrow("deprecation");
    await catalogue.publish(
        await release("1.1.0", [
            capabilityDocument({ deprecation: { retirement: true, reason: "This feature is being withdrawn." } }),
            extra(),
        ]),
    );
    await expect(catalogue.publish(await release("1.2.0", [extra()]))).rejects.toThrow();
    await catalogue.publish(await release("2.0.0", [extra()]));
    await expect(catalogue.publish(await release("3.0.0", [capabilityDocument(), extra()]))).rejects.toThrow("reused");
    for (const deprecation of [
        { retirement: true },
        { retirement: false, reason: "Retired" },
        { retirement: true, reason: "Retired", replacedBy: "email.preview" },
    ]) {
        await expect(release("4.0.0", [capabilityDocument({ deprecation }), extra()])).rejects.toThrow();
    }
});
