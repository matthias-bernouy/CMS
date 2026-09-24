import { describe, expect, test } from "bun:test";
import { parseContractRelease } from "@bernouy/cms-contracts";
import { compareContractReleases } from "@bernouy/cms-contracts/compatibility";
import { projectSchemaValue } from "@bernouy/cms-contracts/schema";
import { capabilityDocument, contractDocument, objectSchema, stringSchema } from "../support/fixtures";

function release(output: unknown, version: string) {
    return parseContractRelease(contractDocument({ version, capabilities: [capabilityDocument({ output })] }));
}

const compare = (previous: unknown, next: unknown, version = "1.1.0") =>
    compareContractReleases(release(previous, "1.0.0"), release(next, version));

describe("release-specific output projection", () => {
    test("projects additive fields recursively inside arrays and maps", () => {
        const previousItem = objectSchema({ name: stringSchema(100) }, ["name"]);
        const nextItem = objectSchema({ name: stringSchema(100), sku: stringSchema(30) }, ["name"]);
        const container = (items: unknown) =>
            objectSchema(
                {
                    records: {
                        type: "map",
                        maxKeyLength: 10,
                        maxProperties: 5,
                        values: {
                            type: "array",
                            maxItems: 5,
                            items,
                        },
                    },
                },
                ["records"],
            );
        const previous = release(container(previousItem), "1.0.0");
        const next = release(container(nextItem), "1.1.0");
        expect(compareContractReleases(previous, next)).toMatchObject({
            validEvolution: true,
            consumerCompatible: true,
            requiredBump: "minor",
        });
        expect(
            projectSchemaValue(previous.capabilities[0]!.output, {
                records: { page: [{ name: "Book", sku: "book-1" }] },
            }),
        ).toEqual({ records: { page: [{ name: "Book" }] } });
        expect(compare(container(previousItem), container(nextItem), "1.0.1")).toMatchObject({
            validEvolution: false,
            consumerCompatible: true,
            requiredBump: "minor",
        });
    });

    test("rejects additions that could leave too few old properties after projection", () => {
        const previous = { ...objectSchema({ name: stringSchema(10) }), minProperties: 1 };
        const next = { ...objectSchema({ name: stringSchema(10), sku: stringSchema(10) }), minProperties: 1 };
        expect(compare(previous, next)).toMatchObject({ consumerCompatible: false, requiredBump: "major" });
        expect(() => projectSchemaValue(release(previous, "1.0.0").capabilities[0]!.output, { sku: "one" })).toThrow();
    });

    test("accounts for required dropped properties when bounding the projected object", () => {
        const previous = { ...objectSchema({ name: stringSchema(10), label: stringSchema(10) }), maxProperties: 1 };
        const next = {
            ...objectSchema({ name: stringSchema(10), label: stringSchema(10), sku: stringSchema(10) }, ["sku"]),
            maxProperties: 2,
        };
        expect(compare(previous, next)).toMatchObject({ consumerCompatible: true, requiredBump: "minor" });
        expect(compare(previous, { ...next, required: [] })).toMatchObject({
            consumerCompatible: false,
            requiredBump: "major",
        });
    });

    test("does not erase declared outputs or truncate expanded scalar values", () => {
        const previous = objectSchema({ name: stringSchema(100), sku: stringSchema(10) }, ["name"]);
        expect(compare(previous, objectSchema({ name: stringSchema(100) }, ["name"]))).toMatchObject({
            consumerCompatible: false,
            requiredBump: "major",
        });
        const next = objectSchema({ name: stringSchema(150), sku: stringSchema(10) }, ["name"]);
        expect(compare(previous, next, "2.0.0")).toMatchObject({
            validEvolution: true,
            consumerCompatible: false,
            requiredBump: "major",
        });
        expect(() =>
            projectSchemaValue(release(previous, "1.0.0").capabilities[0]!.output, { name: "n".repeat(150) }),
        ).toThrow();
    });
});
