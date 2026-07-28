import { describe, expect, test } from "bun:test";
import {
    DEFAULT_CANONICAL_FILE_SET_LIMITS,
    DEFAULT_INTEGRATION_PACKAGE_LIMITS,
    IntegrationPackageValidationError,
    canonicalFileSetBytes,
    canonicalJsonBytes,
    computeIntegrationPackageDigest,
    decodeCanonicalFile,
    decodeIntegrationPackageFile,
    validateCanonicalFileSet,
    validateIntegrationPackageEnvelope,
} from "../../src/exports/index";
import { validPackageEnvelope } from "./fixtures";

function expectCode(input: unknown, code: IntegrationPackageValidationError["code"]): void {
    try {
        validateCanonicalFileSet(input);
        throw new Error("Expected canonical file-set validation to fail");
    } catch (error) {
        expect(error).toBeInstanceOf(IntegrationPackageValidationError);
        expect((error as IntegrationPackageValidationError).code).toBe(code);
    }
}

describe("canonical file-set contract", () => {
    test("is the exact file contract consumed by package v1", () => {
        const input = validPackageEnvelope();
        const packageEnvelope = validateIntegrationPackageEnvelope(input);
        const fileSet = validateCanonicalFileSet(input.files);

        expect(fileSet).toEqual(packageEnvelope.files);
        expect(canonicalFileSetBytes(fileSet)).toEqual(canonicalJsonBytes(packageEnvelope.files));
        expect(DEFAULT_CANONICAL_FILE_SET_LIMITS).toBe(DEFAULT_INTEGRATION_PACKAGE_LIMITS);
    });

    test("does not change the canonical package v1 wire identity", async () => {
        const envelope = validateIntegrationPackageEnvelope(validPackageEnvelope());

        expect(Object.keys(envelope)).toEqual(["schema", "kind", "version", "definition", "releaseNotes", "files"]);
        await expect(computeIntegrationPackageDigest(envelope)).resolves.toBe(
            "1107daeda06c6cb166f1866f2578f2c381f6e549c254259d702fb60e6ebe41aa",
        );
    });

    test("shares canonical encoding semantics with package v1", () => {
        const binary = { encoding: "base64" as const, content: "AAECAw==" };
        const fileSet = validateCanonicalFileSet({
            "notes/é.txt": { encoding: "utf8", content: "e\u0301" },
            "assets/data.bin": binary,
        });

        expect(decodeCanonicalFile(binary)).toEqual(decodeIntegrationPackageFile(binary));
        expect(new TextDecoder().decode(canonicalFileSetBytes(fileSet))).toBe(
            '{"assets/data.bin":{"content":"AAECAw==","encoding":"base64"},"notes/é.txt":{"content":"é","encoding":"utf8"}}',
        );
    });

    test("enforces the shared closed file, path, layout, and byte contracts", () => {
        expectCode({ "safe.txt": { encoding: "utf8", content: "ok", executable: true } }, "invalid_envelope");
        expectCode({ "../escape.txt": { encoding: "utf8", content: "no" } }, "invalid_path");
        expectCode(
            {
                assets: { encoding: "utf8", content: "file" },
                "assets/child.txt": { encoding: "utf8", content: "child" },
            },
            "invalid_path",
        );
        expectCode({ "binary.bin": { encoding: "base64", content: "AB==" } }, "invalid_base64");

        expect(() =>
            validateCanonicalFileSet(
                {
                    "one.txt": { encoding: "utf8", content: "one" },
                    "two.txt": { encoding: "utf8", content: "two" },
                },
                { limits: { maxFiles: 1 } },
            ),
        ).toThrow(/more than 1/);
        expect(() =>
            validateCanonicalFileSet(
                { "large.txt": { encoding: "utf8", content: "larger" } },
                { limits: { maxDecodedBytes: 5 } },
            ),
        ).toThrow(/decoded files exceed 5 bytes/);
        expect(() =>
            canonicalFileSetBytes(
                { "large.txt": { encoding: "utf8", content: "larger" } },
                { limits: { maxDocumentBytes: 10 } },
            ),
        ).toThrow(/canonical file-set exceeds 10 bytes/);
    });

    test("preserves protocol-sensitive file names as own data properties", () => {
        const fileSet = validateCanonicalFileSet(JSON.parse('{"__proto__":{"encoding":"utf8","content":"safe"}}'));

        expect(Object.hasOwn(fileSet, "__proto__")).toBeTrue();
        expect(fileSet.__proto__).toEqual({ encoding: "utf8", content: "safe" });
        expect(Object.getPrototypeOf(fileSet)).toBe(Object.prototype);
    });
});
