import { describe, expect, test } from "bun:test";
import { admitContractRelease, parseContractRelease } from "@bernouy/cms-repository/contracts";
import { InMemoryReleaseCatalogue } from "@bernouy/cms-repository/contracts/catalogue";
import { compareContractReleases } from "@bernouy/cms-repository/contracts/compatibility";
import { validateSchemaValue } from "@bernouy/cms-repository/contracts/schema";
import { capabilityDocument, contractDocument, objectSchema, stringSchema } from "../support/fixtures";

function compare(
    previousCapability: Record<string, unknown>,
    nextCapability: Record<string, unknown>,
    version = "1.1.0",
) {
    const previous = parseContractRelease(
        contractDocument({ version: "1.0.0", capabilities: [capabilityDocument(previousCapability)] }),
    );
    const next = parseContractRelease(
        contractDocument({ version, capabilities: [capabilityDocument(nextCapability)] }),
    );
    return compareContractReleases(previous, next);
}

describe("directional schema compatibility", () => {
    test("widening input length requires minor, not major", async () => {
        const oldInput = objectSchema({ templateId: stringSchema(64) }, ["templateId"]);
        const newInput = objectSchema({ templateId: stringSchema(128) }, ["templateId"]);
        const report = compare({ input: oldInput }, { input: newInput });

        expect(report).toMatchObject({ validEvolution: true, requiredBump: "minor" });
        expect(report.issues).toContainEqual(
            expect.objectContaining({
                code: "schema_changed",
                path: 'capabilities["email.message.send"].input.properties.templateId.maxLength',
                requiredBump: "minor",
            }),
        );
        expect(compare({ input: oldInput }, { input: newInput }, "1.0.1")).toMatchObject({
            validEvolution: false,
            requiredBump: "minor",
        });

        const catalogue = new InMemoryReleaseCatalogue();
        await catalogue.publish(
            await admitContractRelease(
                contractDocument({ version: "1.0.0", capabilities: [capabilityDocument({ input: oldInput })] }),
            ),
        );
        await expect(
            catalogue.publish(
                await admitContractRelease(
                    contractDocument({ version: "1.1.0", capabilities: [capabilityDocument({ input: newInput })] }),
                ),
            ),
        ).resolves.toMatchObject({ admission: { release: { version: "1.1.0" } } });
    });

    test("narrowing input length still requires major", () => {
        const previous = objectSchema({ templateId: stringSchema(128) }, ["templateId"]);
        const next = objectSchema({ templateId: stringSchema(64) }, ["templateId"]);

        const report = compare({ input: previous }, { input: next });
        expect(report).toMatchObject({
            validEvolution: false,
            requiredBump: "major",
        });
        expect(report.issues).toContainEqual(
            expect.objectContaining({
                path: 'capabilities["email.message.send"].input.properties.templateId.maxLength',
                requiredBump: "major",
            }),
        );
        expect(compare({ input: previous }, { input: next }, "2.0.0")).toMatchObject({
            validEvolution: true,
            requiredBump: "major",
        });
    });

    test("output bounds run in the opposite direction", () => {
        const wide = objectSchema({ messageId: stringSchema(128) }, ["messageId"]);
        const narrow = objectSchema({ messageId: stringSchema(64) }, ["messageId"]);

        expect(compare({ output: wide }, { output: narrow })).toMatchObject({
            validEvolution: true,
            requiredBump: "minor",
        });
        expect(compare({ output: narrow }, { output: wide })).toMatchObject({
            validEvolution: false,
            requiredBump: "major",
        });
    });

    test("each selected release keeps its own input and output bounds", () => {
        const oldSchema = objectSchema({ name: stringSchema(100) }, ["name"]);
        const newSchema = objectSchema({ name: stringSchema(150) }, ["name"]);
        const oldRelease = parseContractRelease(
            contractDocument({
                version: "1.0.0",
                capabilities: [capabilityDocument({ input: oldSchema, output: oldSchema })],
            }),
        );
        const newInputRelease = parseContractRelease(
            contractDocument({
                version: "1.1.0",
                capabilities: [capabilityDocument({ input: newSchema, output: oldSchema })],
            }),
        );
        const longerName = { name: "n".repeat(150) };

        expect(() => validateSchemaValue(oldRelease.capabilities[0]!.input, longerName)).toThrow();
        expect(() => validateSchemaValue(newInputRelease.capabilities[0]!.input, longerName)).not.toThrow();
        expect(compareContractReleases(oldRelease, newInputRelease)).toMatchObject({
            validEvolution: true,
            requiredBump: "minor",
        });
        expect(() => validateSchemaValue(oldRelease.capabilities[0]!.output, longerName)).toThrow();
        expect(compare({ output: oldSchema }, { output: newSchema })).toMatchObject({
            validEvolution: false,
            requiredBump: "major",
        });
    });

    test("input enum expansion is minor but output enum expansion is major", () => {
        const one = objectSchema({ value: { type: "string", maxLength: 20, enum: ["plain"] } }, ["value"]);
        const two = objectSchema({ value: { type: "string", maxLength: 20, enum: ["plain", "html"] } }, ["value"]);

        expect(compare({ input: one }, { input: two })).toMatchObject({ validEvolution: true, requiredBump: "minor" });
        expect(compare({ output: one }, { output: two })).toMatchObject({
            validEvolution: false,
            requiredBump: "major",
        });
    });

    test("adding a string format narrows inputs but strengthens outputs", () => {
        const plain = objectSchema({ value: { type: "string", maxLength: 320 } }, ["value"]);
        const email = objectSchema({ value: { type: "string", format: "email", maxLength: 320 } }, ["value"]);

        expect(compare({ input: plain }, { input: email })).toMatchObject({
            validEvolution: false,
            requiredBump: "major",
        });
        expect(compare({ output: plain }, { output: email })).toMatchObject({
            validEvolution: true,
            requiredBump: "minor",
        });
    });

    test("nullable and unchanged semantic defaults follow value-set inclusion", () => {
        const nonNullable = objectSchema({ value: stringSchema(64) }, ["value"]);
        const nullable = objectSchema({ value: { type: "string", maxLength: 64, nullable: true } }, ["value"]);
        const explicitDefault = objectSchema({ value: { type: "string", minLength: 0, maxLength: 64 } }, ["value"]);

        expect(compare({ input: nonNullable }, { input: nullable })).toMatchObject({
            validEvolution: true,
            requiredBump: "minor",
        });
        expect(compare({ output: nullable }, { output: nonNullable })).toMatchObject({
            validEvolution: true,
            requiredBump: "minor",
        });
        expect(compare({ input: nonNullable }, { input: explicitDefault }, "1.0.1")).toMatchObject({
            validEvolution: true,
            requiredBump: "patch",
        });
    });

    test("unknown format relationships and changed errors remain major", () => {
        const email = objectSchema({ value: { type: "string", format: "email", maxLength: 320 } }, ["value"]);
        const uri = objectSchema({ value: { type: "string", format: "uri", maxLength: 320 } }, ["value"]);

        expect(compare({ input: email }, { input: uri })).toMatchObject({
            validEvolution: false,
            requiredBump: "major",
        });
        expect(compare({}, { errors: [{ code: "INVALID_RECIPIENT", retryable: true }] })).toMatchObject({
            validEvolution: false,
            requiredBump: "major",
        });
    });
});
