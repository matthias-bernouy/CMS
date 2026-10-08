import { describe, expect, test } from "bun:test";
import { decodeHttpParameter, encodeHttpParameter } from "@bernouy/cms-repository/contracts/bindings";
import { parseUlviaSchema } from "@bernouy/cms-repository/contracts/schema";
import type { UlviaScalarSchema } from "@bernouy/cms-repository/contracts/schema";

const text: UlviaScalarSchema = { type: "string", nullable: true, maxLength: 128 };
const number: UlviaScalarSchema = { type: "number" };

describe("URI component HTTP parameter encoding", () => {
    test("distinguishes missing, null, empty text and text containing null", () => {
        for (const [value, encoded] of [
            [undefined, undefined],
            [null, "~n"],
            ["", "~s"],
            ["null", "~snull"],
        ] as const) {
            expect(encodeHttpParameter(text, value)).toBe(encoded);
            expect(decodeHttpParameter(text, encoded)).toBe(value);
        }
    });

    test("round-trips Unicode and control characters as ASCII without raw line breaks", () => {
        for (const value of ["café", "😀", "line one\r\nline two", " /?#&+=% "]) {
            const encoded = encodeHttpParameter(text, value)!;
            expect(encoded).toBe(encodeURIComponent(`~s${value}`));
            expect(encoded).toMatch(/^[\x21-\x7E]+$/);
            expect(decodeHttpParameter(text, encoded)).toBe(value);
        }
    });

    test("performs exactly one decoding pass and never treats plus as a space", () => {
        expect(decodeHttpParameter(text, "~s%252F")).toBe("%2F");
        expect(decodeHttpParameter(text, "~s%2B")).toBe("+");
        expect(() => decodeHttpParameter(text, "~s+")).toThrow("percent-encoded");
        expect(decodeHttpParameter({ type: "string", maxLength: 64 }, "%252F")).toBe("%2F");
    });

    test("round-trips numbers and booleans without coercion", () => {
        for (const value of [0, 0.25, -42, Number.MAX_SAFE_INTEGER, Number.MIN_VALUE]) {
            expect(decodeHttpParameter(number, encodeHttpParameter(number, value))).toBe(value);
        }
        const boolean: UlviaScalarSchema = { type: "boolean" };
        expect(decodeHttpParameter(boolean, encodeHttpParameter(boolean, false))).toBe(false);
        expect(() => decodeHttpParameter(number, "%2242%22")).toThrow("finite number");
        expect(() => decodeHttpParameter(boolean, "0")).toThrow("boolean");
    });

    test("rejects non-finite and unsafe integral numbers", () => {
        for (const value of [NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER + 1]) {
            expect(() => encodeHttpParameter(number, value)).toThrow();
        }
        for (const value of ["NaN", "Infinity", "1e400", "9007199254740992"]) {
            expect(() => decodeHttpParameter(number, value)).toThrow();
        }
    });

    test("rejects malformed encodings, malformed Unicode and non-scalar JSON", () => {
        for (const value of ["%", "%GG", "%FF", "%22café%22"]) {
            expect(() => decodeHttpParameter(text, value)).toThrow();
        }
        expect(() => encodeHttpParameter(text, "\uD800")).toThrow("valid Unicode");
        expect(() => decodeHttpParameter(text, "~s%ED%A0%80")).toThrow();
    });

    test("enforces schema length, enum, format, nullability and numeric bounds", () => {
        const bounded: UlviaScalarSchema = { type: "integer", minimum: 1, maximum: 2 };
        expect(() => encodeHttpParameter(bounded, 3)).toThrow("at most 2");
        expect(() => decodeHttpParameter(bounded, "0")).toThrow("at least 1");
        expect(() => encodeHttpParameter(bounded, null)).toThrow("finite number");
        const literal: UlviaScalarSchema = { type: "string", maxLength: 3, enum: ["yes"] };
        expect(() => decodeHttpParameter(literal, "no")).toThrow("enum");
        expect(() => encodeHttpParameter(literal, "long")).toThrow("length");
        const date = parseUlviaSchema({ type: "string", format: "date", maxLength: 10 }) as UlviaScalarSchema;
        expect(() => decodeHttpParameter(date, "2025-02-29")).toThrow("format date");
        expect(() => decodeHttpParameter({ type: "string", maxLength: 0 }, "a".repeat(65))).toThrow("bounded");
    });
});
