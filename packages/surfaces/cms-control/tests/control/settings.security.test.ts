import { describe, test, expect } from "bun:test";
import { parseSettingsUpdateDto } from "cms-control/core/validation/settings/parseUpdateDto";
import InvalidParam from "cms-control/errors/Http/InvalidParam";

// Parsing/coercion only: split the multiline textarea into trimmed lines.
// The URL-validity + origin-normalization + dedupe RULE moved to
// cms-content's `validateSettingsPatch` (see its test).
describe("parseSettingsUpdateDto — security section (parsing)", () => {
    test("returns empty arrays when both fields are empty strings", () => {
        const dto = parseSettingsUpdateDto({ "security.connectExtras": "", "security.mediaExtras": "" });
        expect(dto.security?.connectExtras).toEqual([]);
        expect(dto.security?.mediaExtras).toEqual([]);
    });

    test("splits one entry per line", () => {
        const dto = parseSettingsUpdateDto({ "security.connectExtras": "https://a.com\nhttps://b.com" });
        expect(dto.security?.connectExtras).toEqual(["https://a.com", "https://b.com"]);
    });

    test("skips empty / whitespace lines", () => {
        const dto = parseSettingsUpdateDto({ "security.connectExtras": "https://a.com\n\n   \nhttps://b.com\n" });
        expect(dto.security?.connectExtras).toEqual(["https://a.com", "https://b.com"]);
    });

    test("accepts CRLF line endings", () => {
        const dto = parseSettingsUpdateDto({ "security.connectExtras": "https://a.com\r\nhttps://b.com" });
        expect(dto.security?.connectExtras).toEqual(["https://a.com", "https://b.com"]);
    });

    test("rejects a non-string body value", () => {
        expect(() => parseSettingsUpdateDto({ "security.connectExtras": 42 as unknown as string })).toThrow(InvalidParam);
    });

    test("only sets connectExtras when only that key is present (partial update)", () => {
        const dto = parseSettingsUpdateDto({ "security.connectExtras": "https://api.x.com" });
        expect(dto.security?.connectExtras).toEqual(["https://api.x.com"]);
        expect(dto.security?.mediaExtras).toBeUndefined();
    });

    test("does not emit a security section when no security key is present", () => {
        const dto = parseSettingsUpdateDto({ "site.name": "Hello" });
        expect(dto.security).toBeUndefined();
    });

    test("treats connectExtras and mediaExtras independently", () => {
        const dto = parseSettingsUpdateDto({ "security.connectExtras": "https://api.x.com", "security.mediaExtras": "https://cdn.x.com" });
        expect(dto.security?.connectExtras).toEqual(["https://api.x.com"]);
        expect(dto.security?.mediaExtras).toEqual(["https://cdn.x.com"]);
    });

    test("ignores legacy editor.shell updates", () => {
        const dto = parseSettingsUpdateDto({
            "editor.layoutCategory": "Layouts",
            "editor.shell": "<cms-binding-core>{{CONTENT}}</cms-binding-core>",
        });
        expect(dto.editor).toEqual({ layoutCategory: "Layouts" });
    });
});
