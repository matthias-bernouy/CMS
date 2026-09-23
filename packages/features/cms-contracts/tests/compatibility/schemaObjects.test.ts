import { describe, expect, test } from "bun:test";
import { parseContractRelease } from "@bernouy/cms-contracts";
import { compareContractReleases } from "@bernouy/cms-contracts/compatibility";
import { capabilityDocument, contractDocument, objectSchema, stringSchema } from "../support/fixtures";

function compare(previousCapability: Record<string, unknown>, nextCapability: Record<string, unknown>) {
    const previous = parseContractRelease(
        contractDocument({ version: "1.0.0", capabilities: [capabilityDocument(previousCapability)] }),
    );
    const next = parseContractRelease(
        contractDocument({ version: "1.1.0", capabilities: [capabilityDocument(nextCapability)] }),
    );
    return compareContractReleases(previous, next);
}

describe("closed-object schema compatibility", () => {
    test("optional input properties are additive but required ones break old callers", () => {
        const previous = objectSchema({ templateId: stringSchema(64) }, ["templateId"]);
        const optional = objectSchema({ templateId: stringSchema(64), locale: stringSchema(8) }, ["templateId"]);
        const required = objectSchema({ templateId: stringSchema(64), locale: stringSchema(8) }, [
            "templateId",
            "locale",
        ]);

        expect(compare({ input: previous }, { input: optional })).toMatchObject({
            compatible: true,
            requiredBump: "minor",
        });
        expect(compare({ input: previous }, { input: required })).toMatchObject({
            compatible: false,
            requiredBump: "major",
        });
    });

    test("adding a possible output property breaks closed-object consumers", () => {
        const previous = objectSchema({ messageId: stringSchema(64) }, ["messageId"]);
        const next = objectSchema({ messageId: stringSchema(64), trace: stringSchema(32) }, ["messageId"]);

        expect(compare({ output: previous }, { output: next })).toMatchObject({
            compatible: false,
            requiredBump: "major",
        });
    });

    test("requiring an already declared output field narrows possible outputs", () => {
        const optional = objectSchema({ messageId: stringSchema(64) });
        const required = objectSchema({ messageId: stringSchema(64) }, ["messageId"]);

        expect(compare({ output: optional }, { output: required })).toMatchObject({
            compatible: true,
            requiredBump: "minor",
        });
        expect(compare({ output: required }, { output: optional })).toMatchObject({
            compatible: false,
            requiredBump: "major",
        });
    });
});
