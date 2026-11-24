import { beforeAll, afterAll, describe, expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { parseSchemaDescriptor } from "@bernouy/ulvia-contracts/resolution";
import { MongoSchemaVersions } from "@bernouy/cms-gateway/provider/schema-mongo";
import { contentMongo } from "../../../../tests/integration/content/mongo";
const enabled = process.env.ULVIA_RUN_EVENTS_MONGO === "1";
describe.skipIf(!enabled)("Dynamic event schema version seals", () => {
    let mongo: Awaited<ReturnType<typeof contentMongo>>;
    beforeAll(async () => {
        mongo = await contentMongo();
    }, 30000);
    afterAll(async () => {
        await mongo?.close();
    }, 30000);
    test("one source/resource/version admits exactly one digest, including concurrent resolves and reopen", async () => {
        const db = mongo.client.db(`schema_seals_${crypto.randomUUID().replaceAll("-", "")}`);
        const versions = new MongoSchemaVersions(db);
        const scope = {
            siteId: "site-a",
            providerId: "test/forms",
            installationId: "installation",
            instanceId: "instance",
            contractId: "test/forms",
            resolverId: "forms.describe",
        };
        const first = descriptor("string");
        const changed = descriptor("number");
        let count = 0;
        const results = await Promise.allSettled(
            Array.from({ length: 8 }, () =>
                versions.seal(scope, parseSchemaDescriptor(count++ % 2 === 0 ? first : changed)),
            ),
        );
        expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(4);
        const refused = results.filter((result) => result.status === "rejected");
        expect(refused).toHaveLength(4);
        for (const result of refused) {
            if (result.status === "rejected") {
                expect(result.reason.code).toBe("SCHEMA_VERSION_CONFLICT");
            }
        }
        expect(await db.collection("schema_versions").countDocuments()).toBe(1);
        const seal = await db.collection("schema_versions").findOne({});
        const valid = seal!.digest === first.digest ? first : changed;
        const invalid = seal!.digest === first.digest ? changed : first;
        await expect(new MongoSchemaVersions(db).seal(scope, parseSchemaDescriptor(invalid))).rejects.toHaveProperty(
            "code",
            "SCHEMA_VERSION_CONFLICT",
        );
        await versions.seal(scope, parseSchemaDescriptor({ ...valid, version: "8" }));
        await versions.seal({ ...scope, instanceId: "foreign" }, parseSchemaDescriptor(invalid));
        await versions.seal({ ...scope, resolverId: "another.view" }, parseSchemaDescriptor(invalid));
        await versions.seal(
            { ...scope, installationId: "another-account-on-the-same-instance" },
            parseSchemaDescriptor(invalid),
        );
        expect(await db.collection("schema_versions").countDocuments()).toBe(5);
        expect(Object.keys(seal!).sort()).toEqual(["_id", "digest"]);
    });
});
function descriptor(type: "string" | "number") {
    const schema = {
        type: "object",
        properties: { message: type === "string" ? { type, maxLength: 100 } : { type, minimum: 0, maximum: 100 } },
        required: ["message"],
    };
    const fields = [{ id: "message", property: "message", label: "Message", sensitive: false }];
    return {
        resourceId: "contact",
        version: "7",
        schemaJson: canonicalizeIJson(schema),
        fields,
        digest: `sha256:${createHash("sha256")
            .update(
                canonicalizeIJson({
                    schema,
                    fields: fields.map(({ id, property, sensitive }) => ({ id, property, sensitive })),
                }),
            )
            .digest("hex")}`,
    };
}
