import { describe, expect, test } from "bun:test";
import { IntegrationPackageValidationError, parseIntegrationPackageEnvelope } from "../../src/exports/index";
import { validPackageEnvelope } from "./fixtures";

function expectCode(action: () => unknown, code: IntegrationPackageValidationError["code"]): void {
    try {
        action();
        throw new Error("Expected integration package parsing to fail");
    } catch (error) {
        expect(error).toBeInstanceOf(IntegrationPackageValidationError);
        expect((error as IntegrationPackageValidationError).code).toBe(code);
    }
}

describe("integration package JSON parsing", () => {
    test("parses a strict UTF-8 v1 envelope", () => {
        const source = JSON.stringify(validPackageEnvelope());

        expect(parseIntegrationPackageEnvelope(new TextEncoder().encode(source))).toEqual(validPackageEnvelope());
    });

    test.each([
        ["comment", `${JSON.stringify(validPackageEnvelope())}\n// comment`],
        ["trailing comma", JSON.stringify(validPackageEnvelope()).replace(/}$/, ",}")],
        ["BOM", `\ufeff${JSON.stringify(validPackageEnvelope())}`],
    ])("rejects JSON with a %s", (_label, source) => {
        expectCode(() => parseIntegrationPackageEnvelope(source), "invalid_json");
    });

    test("rejects byte input that is not valid UTF-8", () => {
        expectCode(() => parseIntegrationPackageEnvelope(Uint8Array.of(0x7b, 0xff, 0x7d)), "invalid_utf8");
    });

    test("rejects duplicate decoded root properties", () => {
        const source = JSON.stringify(validPackageEnvelope()).replace(
            '"kind":"commerce"',
            '"kind":"commerce","\\u006bind":"other"',
        );

        expectCode(() => parseIntegrationPackageEnvelope(source), "duplicate_json_property");
    });

    test("rejects duplicate decoded paths in the files object", () => {
        const source = JSON.stringify(validPackageEnvelope()).replace(
            '"definition.json":{"encoding":"utf8"',
            '"definition.json":{"encoding":"utf8","content":"first"},"\\u0064efinition.json":{"encoding":"utf8"',
        );

        expectCode(() => parseIntegrationPackageEnvelope(source), "duplicate_json_property");
    });

    test("rejects duplicate properties nested in a file entry", () => {
        const source = JSON.stringify(validPackageEnvelope()).replace(
            '"encoding":"utf8"',
            '"encoding":"utf8","\\u0065ncoding":"base64"',
        );

        expectCode(() => parseIntegrationPackageEnvelope(source), "duplicate_json_property");
    });

    test("rejects isolated Unicode surrogates before canonicalization", () => {
        const source = JSON.stringify({ ...validPackageEnvelope(), kind: "\ud800" });

        expectCode(() => parseIntegrationPackageEnvelope(source), "invalid_unicode");
    });
});
