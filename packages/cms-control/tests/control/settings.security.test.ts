import { describe, test, expect } from "bun:test";
import { parseSettingsUpdateDto } from "src/control/core/validation/settings/parseUpdateDto";
import InvalidParam from "src/control/errors/Http/InvalidParam";

describe("parseSettingsUpdateDto — security section", () => {
    test("returns empty arrays when both fields are empty strings", () => {
        const dto = parseSettingsUpdateDto({
            "security.connectExtras": "",
            "security.mediaExtras":   "",
        });
        expect(dto.security?.connectExtras).toEqual([]);
        expect(dto.security?.mediaExtras).toEqual([]);
    });

    test("parses one URL per line, normalised to origin", () => {
        const dto = parseSettingsUpdateDto({
            "security.connectExtras": "https://api.example.com\nhttps://x.supabase.co/rest/v1/",
        });
        expect(dto.security?.connectExtras).toEqual([
            "https://api.example.com",
            "https://x.supabase.co",
        ]);
    });

    test("strips default ports and trailing slashes via URL.origin", () => {
        const dto = parseSettingsUpdateDto({
            "security.connectExtras": "https://example.com:443/foo",
        });
        expect(dto.security?.connectExtras).toEqual(["https://example.com"]);
    });

    test("preserves non-default ports", () => {
        const dto = parseSettingsUpdateDto({
            "security.connectExtras": "http://localhost:5002",
        });
        expect(dto.security?.connectExtras).toEqual(["http://localhost:5002"]);
    });

    test("dedupes lines that normalise to the same origin", () => {
        const dto = parseSettingsUpdateDto({
            "security.connectExtras": "https://x.com\nhttps://x.com:443/foo\nhttps://x.com/bar",
        });
        expect(dto.security?.connectExtras).toEqual(["https://x.com"]);
    });

    test("skips empty / whitespace lines", () => {
        const dto = parseSettingsUpdateDto({
            "security.connectExtras": "https://a.com\n\n   \nhttps://b.com\n",
        });
        expect(dto.security?.connectExtras).toEqual(["https://a.com", "https://b.com"]);
    });

    test("accepts CRLF line endings", () => {
        const dto = parseSettingsUpdateDto({
            "security.connectExtras": "https://a.com\r\nhttps://b.com",
        });
        expect(dto.security?.connectExtras).toEqual(["https://a.com", "https://b.com"]);
    });

    test("rejects an unparseable URL", () => {
        expect(() => parseSettingsUpdateDto({
            "security.connectExtras": "https://ok.com\nnot-a-url",
        })).toThrow(InvalidParam);
    });

    test("rejects a non-string body value", () => {
        expect(() => parseSettingsUpdateDto({
            "security.connectExtras": 42 as unknown as string,
        })).toThrow(InvalidParam);
    });

    test("only sets connectExtras when only that key is present (preserves partial update)", () => {
        const dto = parseSettingsUpdateDto({
            "security.connectExtras": "https://api.x.com",
        });
        expect(dto.security?.connectExtras).toEqual(["https://api.x.com"]);
        expect(dto.security?.mediaExtras).toBeUndefined();
    });

    test("does not emit a security section when no security key is present", () => {
        const dto = parseSettingsUpdateDto({
            "site.name": "Hello",
        });
        expect(dto.security).toBeUndefined();
    });

    test("treats both connectExtras and mediaExtras independently", () => {
        const dto = parseSettingsUpdateDto({
            "security.connectExtras": "https://api.x.com",
            "security.mediaExtras":   "https://cdn.x.com",
        });
        expect(dto.security?.connectExtras).toEqual(["https://api.x.com"]);
        expect(dto.security?.mediaExtras).toEqual(["https://cdn.x.com"]);
    });
});
