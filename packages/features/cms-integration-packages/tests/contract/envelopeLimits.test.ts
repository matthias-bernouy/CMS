import { describe, expect, test } from "bun:test";
import {
    IntegrationPackageValidationError,
    canonicalJsonBytes,
    decodeIntegrationPackageFile,
    parseIntegrationPackageEnvelope,
    validateIntegrationPackageEnvelope,
} from "../../src/exports/index";
import { validPackageEnvelope } from "./fixtures";

function expectCode(action: () => unknown, code: IntegrationPackageValidationError["code"]): void {
    try {
        action();
        throw new Error("Expected integration package validation to fail");
    } catch (error) {
        expect(error).toBeInstanceOf(IntegrationPackageValidationError);
        expect((error as IntegrationPackageValidationError).code).toBe(code);
    }
}

describe("integration package encodings and limits", () => {
    test("round-trips UTF-8 and base64 contents", () => {
        expect(new TextDecoder().decode(decodeIntegrationPackageFile({ encoding: "utf8", content: "héllo" }))).toBe(
            "héllo",
        );
        expect(decodeIntegrationPackageFile({ encoding: "base64", content: "AAECAw==" })).toEqual(
            Uint8Array.of(0, 1, 2, 3),
        );
    });

    test.each(["A", "AAA", "AA=A", "AA-_", "AA==\n", "====", "AB==", "AAB="])(
        "rejects malformed or non-canonical base64 %j",
        (content) => {
            const envelope = validPackageEnvelope();
            envelope.files["assets/icon.png"] = { encoding: "base64", content };

            expectCode(() => validateIntegrationPackageEnvelope(envelope), "invalid_base64");
        },
    );

    test("enforces file and decoded-byte limits", () => {
        expectCode(
            () => validateIntegrationPackageEnvelope(validPackageEnvelope(), { limits: { maxFiles: 2 } }),
            "file_limit_exceeded",
        );
        expectCode(
            () => validateIntegrationPackageEnvelope(validPackageEnvelope(), { limits: { maxDecodedBytes: 10 } }),
            "decoded_bytes_limit_exceeded",
        );
        expectCode(
            () => validateIntegrationPackageEnvelope(validPackageEnvelope(), { limits: { maxFileBytes: 10 } }),
            "decoded_bytes_limit_exceeded",
        );
    });

    test("enforces the actual UTF-8 JSON document byte limit", () => {
        const envelope = validPackageEnvelope();
        envelope.files[envelope.releaseNotes!].content = "é".repeat(20);
        const source = JSON.stringify(envelope);
        expect(new TextEncoder().encode(source).byteLength).toBeGreaterThan(source.length);

        expectCode(
            () => parseIntegrationPackageEnvelope(source, { limits: { maxDocumentBytes: source.length } }),
            "body_limit_exceeded",
        );
    });

    test("enforces the canonical document limit for programmatic envelopes", () => {
        const envelope = validPackageEnvelope();
        const canonicalBytes = canonicalJsonBytes(envelope);

        expectCode(
            () =>
                validateIntegrationPackageEnvelope(envelope, {
                    limits: { maxDocumentBytes: canonicalBytes.byteLength - 1 },
                }),
            "body_limit_exceeded",
        );
    });

    test.each([
        ["absolute", "/definition.json"],
        ["dot", "./definition.json"],
        ["dot-dot", "assets/../definition.json"],
        ["empty segment", "assets//icon.png"],
        ["backslash", "assets\\icon.png"],
        ["Windows drive", "C:/definition.json"],
        ["NUL", "assets/\0icon.png"],
    ])("rejects %s paths", (_label, path) => {
        const envelope = validPackageEnvelope();
        envelope.definition = path;

        expectCode(() => validateIntegrationPackageEnvelope(envelope), "invalid_path");
    });

    test("enforces path depth, segment, and total-byte limits", () => {
        const depth = validPackageEnvelope();
        depth.definition = `${Array.from({ length: 33 }, () => "a").join("/")}.json`;
        expectCode(() => validateIntegrationPackageEnvelope(depth), "invalid_path");

        const segment = validPackageEnvelope();
        segment.definition = `${"a".repeat(256)}.json`;
        expectCode(() => validateIntegrationPackageEnvelope(segment), "invalid_path");

        const total = validPackageEnvelope();
        total.definition = Array.from({ length: 17 }, () => "a".repeat(250)).join("/");
        expectCode(() => validateIntegrationPackageEnvelope(total), "invalid_path");
    });
});
