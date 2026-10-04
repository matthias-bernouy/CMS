import { describe, expect, test } from "bun:test";
import { ifNoneMatchMatches, ifRangeAllowsPartial, parseContentRange, parseSingleByteRange } from "../../src/exports";

describe("HTTP byte ranges", () => {
    test("parses bounded, open and suffix requests", () => {
        expect(parseSingleByteRange("bytes=2-4", 10)).toEqual({ start: 2, end: 4 });
        expect(parseSingleByteRange("bytes=8-", 10)).toEqual({ start: 8, end: 9 });
        expect(parseSingleByteRange("bytes=-3", 10)).toEqual({ start: 7, end: 9 });
        expect(parseSingleByteRange("bytes=20-", 10)).toBe("unsatisfiable");
        expect(parseSingleByteRange("items=0-1", 10)).toBeNull();
    });

    test("validates content ranges and strong If-Range validators", () => {
        expect(parseContentRange("bytes 2-4/10")).toEqual({ start: 2, end: 4, size: 10 });
        expect(parseContentRange("bytes 4-2/10")).toBeNull();
        expect(ifRangeAllowsPartial(null, '"v1"')).toBeTrue();
        expect(ifRangeAllowsPartial('W/"v1"', '"v1"')).toBeFalse();
        expect(ifNoneMatchMatches('"other", W/"v1"', '"v1"')).toBeTrue();
        expect(ifNoneMatchMatches('"other"', '"v1"')).toBeFalse();
    });
});
