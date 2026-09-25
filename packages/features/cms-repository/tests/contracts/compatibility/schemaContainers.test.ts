import { describe, expect, test } from "bun:test";
import { parseContractRelease } from "@bernouy/cms-repository/contracts";
import { compareContractReleases } from "@bernouy/cms-repository/contracts/compatibility";
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

describe("container and binary schema compatibility", () => {
    test("compares array item constraints recursively", () => {
        const oldInput = objectSchema({ tags: { type: "array", items: stringSchema(16), maxItems: 2 } }, ["tags"]);
        const newInput = objectSchema({ tags: { type: "array", items: stringSchema(32), maxItems: 4 } }, ["tags"]);

        expect(compare({ input: oldInput }, { input: newInput })).toMatchObject({
            validEvolution: true,
            requiredBump: "minor",
        });
        expect(compare({ input: newInput }, { input: oldInput })).toMatchObject({
            validEvolution: false,
            requiredBump: "major",
        });
    });

    test("compares map keys, counts, and nested values", () => {
        const oldMap = { type: "map", maxKeyLength: 16, maxProperties: 2, values: stringSchema(64) };
        const newMap = { type: "map", maxKeyLength: 32, maxProperties: 4, values: stringSchema(128) };

        expect(
            compare({ input: objectSchema({ labels: oldMap }) }, { input: objectSchema({ labels: newMap }) }),
        ).toMatchObject({
            validEvolution: true,
            requiredBump: "minor",
        });
        expect(
            compare({ output: objectSchema({ labels: oldMap }) }, { output: objectSchema({ labels: newMap }) }),
        ).toMatchObject({
            validEvolution: false,
            requiredBump: "major",
        });
    });

    test("compares number and integer value sets conservatively", () => {
        const integer = objectSchema({ amount: { type: "integer", minimum: 0, maximum: 100 } }, ["amount"]);
        const number = objectSchema({ amount: { type: "number", minimum: 0, maximum: 100 } }, ["amount"]);

        expect(compare({ input: integer }, { input: number })).toMatchObject({
            validEvolution: true,
            requiredBump: "minor",
        });
        expect(compare({ output: number }, { output: integer })).toMatchObject({
            validEvolution: true,
            requiredBump: "minor",
        });
        expect(compare({ input: number }, { input: integer })).toMatchObject({
            validEvolution: false,
            requiredBump: "major",
        });
    });

    test("expanding accepted binary inputs is minor", () => {
        const binary = (maxBytes: number, mediaTypes: readonly string[]) => ({
            input: objectSchema({ attachment: { type: "binary", maxBytes, mediaTypes } }, ["attachment"]),
            binding: {
                transport: "http",
                method: "POST",
                path: "/v1/files",
                input: { body: { binaryProperty: "attachment" } },
            },
        });

        expect(
            compare(binary(1024, ["application/pdf"]), binary(2048, ["application/pdf", "image/png"])),
        ).toMatchObject({
            validEvolution: true,
            requiredBump: "minor",
        });
        expect(
            compare(binary(2048, ["application/pdf", "image/png"]), binary(1024, ["application/pdf"])),
        ).toMatchObject({
            validEvolution: false,
            requiredBump: "major",
        });
    });

    test("narrowing possible binary outputs is minor", () => {
        const binary = (maxBytes: number, mediaTypes: readonly string[]) => ({
            output: { type: "binary", maxBytes, mediaTypes },
            binding: {
                transport: "http",
                method: "POST",
                path: "/v1/files",
                input: { body: true },
                response: {
                    successStatuses: [200],
                    contentTypes: mediaTypes,
                    errorStatuses: { INVALID_RECIPIENT: 422 },
                },
            },
        });

        expect(
            compare(binary(2048, ["application/pdf", "image/png"]), binary(1024, ["application/pdf"])),
        ).toMatchObject({
            validEvolution: true,
            requiredBump: "minor",
        });
        expect(
            compare(binary(1024, ["application/pdf"]), binary(2048, ["application/pdf", "image/png"])),
        ).toMatchObject({
            validEvolution: false,
            requiredBump: "major",
        });
    });
});
