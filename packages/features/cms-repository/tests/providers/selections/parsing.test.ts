import { describe, expect, test } from "bun:test";
import {
    DEFAULT_CONTRACT_SELECTION_LIMITS,
    parseContractSelections,
    parseContractSelectionsJson,
} from "@bernouy/cms-repository/providers/selections";

const selection = {
    siteId: "site:one",
    contractId: "payment",
    version: "1.0.0",
    digest: `sha256:${"a".repeat(64)}`,
    installationId: "installation:one",
};

describe("strict contract selection parsing", () => {
    test("returns canonical independent immutable selections", () => {
        const input = [{ ...selection }, { ...selection, contractId: "commerce" }];
        const parsed = parseContractSelections(input);
        expect(parsed.map((item) => item.contractId)).toEqual(["commerce", "payment"]);
        expect(Object.isFrozen(parsed)).toBe(true);
        expect(Object.isFrozen(parsed[0])).toBe(true);
        expect(Object.isFrozen(input[0])).toBe(false);
        input[0]!.version = "2.0.0";
        expect(parsed[1]!.version).toBe("1.0.0");
    });

    test("rejects unknown fields, inexact pins, duplicates and malformed IDs", () => {
        for (const value of [
            [{ ...selection, extra: true }],
            [{ ...selection, version: "^1.0.0" }],
            [{ ...selection, digest: "latest" }],
            [{ ...selection, installationId: "" }],
            [{ ...selection, contractId: "Bad Contract" }],
            [selection, selection],
            null,
            {},
        ]) {
            expect(() => parseContractSelections(value)).toThrow();
        }
    });

    test("rejects sparse and extended arrays, oversized documents and invalid limits", () => {
        const sparse = new Array(2);
        sparse[1] = selection;
        const extended = Object.assign([selection], { extra: true });
        for (const value of [sparse, extended]) {
            expect(() => parseContractSelections(value)).toThrow();
        }
        expect(() =>
            parseContractSelections([selection, selection], { ...DEFAULT_CONTRACT_SELECTION_LIMITS, maxSelections: 1 }),
        ).toThrow("too many selections");
        expect(() =>
            parseContractSelections([selection], { ...DEFAULT_CONTRACT_SELECTION_LIMITS, maxDocumentBytes: 8 }),
        ).toThrow("byte limit");
        expect(() => parseContractSelections([], { ...DEFAULT_CONTRACT_SELECTION_LIMITS, maxSelections: 0 })).toThrow(
            TypeError,
        );
    });

    test("strict JSON rejects duplicate properties, invalid UTF-8 and excessive depth", () => {
        expect(() => parseContractSelectionsJson('[{"siteId":"a","siteId":"b"}]')).toThrow();
        expect(() => parseContractSelectionsJson(new Uint8Array([0xff]))).toThrow();
        expect(() =>
            parseContractSelectionsJson("[[[[[]]]]]", { ...DEFAULT_CONTRACT_SELECTION_LIMITS, maxJsonDepth: 2 }),
        ).toThrow();
        expect(parseContractSelectionsJson(JSON.stringify([selection]))).toEqual([selection]);
    });
});
