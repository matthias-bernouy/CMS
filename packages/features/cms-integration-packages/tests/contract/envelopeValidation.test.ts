import { describe, expect, test } from "bun:test";
import { IntegrationPackageValidationError, validateIntegrationPackageEnvelope } from "../../src/exports/index";
import { validPackageEnvelope } from "./fixtures";

function expectCode(input: unknown, code: IntegrationPackageValidationError["code"]): void {
    try {
        validateIntegrationPackageEnvelope(input);
        throw new Error("Expected integration package validation to fail");
    } catch (error) {
        expect(error).toBeInstanceOf(IntegrationPackageValidationError);
        expect((error as IntegrationPackageValidationError).code).toBe(code);
    }
}

describe("integration package envelope validation", () => {
    test("rejects unknown envelope and file fields", () => {
        expectCode({ ...validPackageEnvelope(), digest: "untrusted" }, "invalid_envelope");
        const envelope = validPackageEnvelope();
        envelope.files[envelope.definition] = {
            ...envelope.files[envelope.definition]!,
            unexpected: true,
        } as never;
        expectCode(envelope, "invalid_envelope");
    });

    test.each(["1", "v1.2.3", "1.2.3.4", "1.2.3 ", "1.2.3+BUILD_1"])(
        "rejects non-canonical exact version %s",
        (version) => {
            expectCode({ ...validPackageEnvelope(), version }, "invalid_version");
        },
    );

    test.each(["", " commerce", "commerce/stripe", "..", "commerce\\stripe", "commerce.stripe"])(
        "rejects unsafe kind %j",
        (kind) => {
            expectCode({ ...validPackageEnvelope(), kind }, "invalid_envelope");
        },
    );

    test("requires definition and release notes references to point at UTF-8 files", () => {
        const missing = validPackageEnvelope();
        missing.definition = "missing.json";
        expectCode(missing, "missing_file");

        const binaryNotes = validPackageEnvelope();
        binaryNotes.files[binaryNotes.releaseNotes!] = { encoding: "base64", content: "AA==" };
        expectCode(binaryNotes, "invalid_encoding");
    });

    test("allows absent legacy notes but can require them for managed publication", () => {
        const legacy = validPackageEnvelope();
        delete legacy.files[legacy.releaseNotes!];
        delete legacy.releaseNotes;

        expect(validateIntegrationPackageEnvelope(legacy).releaseNotes).toBeUndefined();
        expect(() => validateIntegrationPackageEnvelope(legacy, { requireReleaseNotes: true })).toThrow(
            /releaseNotes is required/,
        );
    });

    test("does not allow definition and release notes to alias one file", () => {
        const envelope = validPackageEnvelope();
        envelope.releaseNotes = envelope.definition;

        expectCode(envelope, "invalid_envelope");
    });

    test("preserves a __proto__ file as an own data property", () => {
        const source = JSON.stringify(validPackageEnvelope()).replace(
            '"assets/icon.png":{"encoding":"base64","content":"AAECAw=="}',
            '"__proto__":{"encoding":"utf8","content":"safe"}',
        );

        const envelope = validateIntegrationPackageEnvelope(JSON.parse(source));
        expect(Object.hasOwn(envelope.files, "__proto__")).toBe(true);
        expect(envelope.files.__proto__).toEqual({ encoding: "utf8", content: "safe" });
        expect(Object.getPrototypeOf(envelope.files)).toBe(Object.prototype);
    });

    test("rejects programmatic hostile values with precise error classes", () => {
        expectCode({ ...validPackageEnvelope(), unexpected: undefined }, "invalid_envelope");

        let nested: unknown = null;
        for (let depth = 0; depth < 65; depth += 1) {
            nested = [nested];
        }
        expectCode({ ...validPackageEnvelope(), unexpected: nested }, "json_depth_limit_exceeded");
    });
});
