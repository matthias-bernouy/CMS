import { describe, expect, test } from "bun:test";
import {
    asRepeatRange,
    CMS_REPEAT_RANGE_MAX,
    isCmsRepeatRangeCount,
    parseRepeat,
    parseRepeatRange,
} from "../../src/exports/editor";

describe("repeat range binding syntax", () => {
    test("serializes and parses a canonical fixed range", () => {
        const value = asRepeatRange({ count: 5, alias: "index" });

        expect(value).toBe("$range(5) as index");
        expect(parseRepeat(value)).toEqual({ path: "$range(5)", alias: "index" });
        expect(parseRepeatRange(value)).toEqual({ count: 5, alias: "index" });
    });

    test("accepts zero and the public upper bound", () => {
        expect(parseRepeatRange("$range(0) as index")).toEqual({ count: 0, alias: "index" });
        expect(isCmsRepeatRangeCount(CMS_REPEAT_RANGE_MAX)).toBe(true);
        expect(asRepeatRange({ count: CMS_REPEAT_RANGE_MAX, alias: "position" })).toBe(
            `$range(${CMS_REPEAT_RANGE_MAX}) as position`,
        );
    });

    test("rejects missing aliases and invalid counts", () => {
        expect(parseRepeatRange("$range(5)")).toBeNull();
        expect(parseRepeatRange("$range(-1) as index")).toBeNull();
        expect(parseRepeatRange("$range(1.5) as index")).toBeNull();
        expect(parseRepeatRange(`$range(${CMS_REPEAT_RANGE_MAX + 1}) as index`)).toBeNull();
        expect(() => asRepeatRange({ count: -1, alias: "index" })).toThrow(RangeError);
        expect(() => asRepeatRange({ count: 2, alias: "bad alias" })).toThrow(TypeError);
    });
});
