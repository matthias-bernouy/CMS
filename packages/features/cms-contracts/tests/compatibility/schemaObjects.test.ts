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
            validEvolution: true,
            requiredBump: "minor",
        });
        expect(compare({ input: previous }, { input: required })).toMatchObject({
            validEvolution: false,
            requiredBump: "major",
        });
    });

    test("adding an output property is minor when old consumers receive a valid projection", () => {
        const previous = objectSchema({ messageId: stringSchema(64) }, ["messageId"]);
        const next = objectSchema({ messageId: stringSchema(64), trace: stringSchema(32) }, ["messageId"]);

        expect(compare({ output: previous }, { output: next })).toMatchObject({
            validEvolution: true,
            consumerCompatible: true,
            requiredBump: "minor",
        });
    });

    test("requiring an already declared output field narrows possible outputs", () => {
        const optional = objectSchema({ messageId: stringSchema(64) });
        const required = objectSchema({ messageId: stringSchema(64) }, ["messageId"]);

        expect(compare({ output: optional }, { output: required })).toMatchObject({
            validEvolution: true,
            requiredBump: "minor",
        });
        expect(compare({ output: required }, { output: optional })).toMatchObject({
            validEvolution: false,
            requiredBump: "major",
        });
    });

    test("recognizes equivalent required fields implied by a closed object's minimum count", () => {
        const explicit = objectSchema({ name: stringSchema(64) }, ["name"]);
        const implied = { ...objectSchema({ name: stringSchema(64) }), minProperties: 1 };
        for (const field of ["input", "output"]) {
            for (const [previous, next] of [
                [explicit, implied],
                [implied, explicit],
            ]) {
                expect(compare({ [field]: previous }, { [field]: next })).toMatchObject({
                    consumerCompatible: true,
                    validEvolution: true,
                    requiredBump: "patch",
                    issues: [],
                });
            }
        }
    });

    test("recognizes guaranteed properties recursively without assuming any optional choice is guaranteed", () => {
        const explicit = objectSchema({ name: stringSchema(64), locale: stringSchema(8) }, ["name", "locale"]);
        const implied = {
            ...objectSchema({ name: stringSchema(64), locale: stringSchema(8) }, ["locale"]),
            minProperties: 2,
        };
        const wrap = (schema: unknown) => objectSchema({ details: schema }, ["details"]);
        for (const field of ["input", "output"]) {
            expect(compare({ [field]: wrap(explicit) }, { [field]: wrap(implied) })).toMatchObject({
                consumerCompatible: true,
                requiredBump: "patch",
            });
        }
        const choice = { ...implied, minProperties: 1, required: [] };
        expect(compare({ input: choice }, { input: explicit }).requiredBump).toBe("major");
        expect(compare({ output: explicit }, { output: choice }).requiredBump).toBe("major");
    });

    test("proves projected presence when every new output property is guaranteed by the count", () => {
        const previous = objectSchema({ name: stringSchema(64) }, ["name"]);
        const next = { ...objectSchema({ name: stringSchema(64), trace: stringSchema(64) }), minProperties: 2 };
        expect(compare({ output: previous }, { output: next })).toMatchObject({
            consumerCompatible: true,
            validEvolution: true,
            requiredBump: "minor",
        });
        expect(compare({ output: previous }, { output: { ...next, minProperties: 1 } }).requiredBump).toBe("major");
    });
});
