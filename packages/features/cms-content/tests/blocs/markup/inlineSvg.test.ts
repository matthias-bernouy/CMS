import { describe, expect, test } from "bun:test";
import { parseInlineSvgAsset, validateBlocContentMarkup } from "@bernouy/cms-content/page-document";

describe("inline SVG assets", () => {
    test("accepts a small presentation-only geometry profile", () => {
        expect(
            parseInlineSvgAsset(`
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M4 12h16" />
                    <circle cx="12" cy="12" r="4" />
                </svg>
            `),
        ).toEqual({
            viewBox: "0 0 24 24",
            presentation: {
                fill: "none",
                stroke: "currentColor",
                "stroke-width": "2",
            },
            markup: expect.stringContaining('<path d="M4 12h16" />'),
            byteLength: expect.any(Number),
            elementCount: 3,
        });
    });

    test.each([
        ['<svg viewBox="0 0 24 24"><script>alert(1)</script></svg>', "element is forbidden"],
        ['<svg viewBox="0 0 24 24"><use href="#icon" /></svg>', "element is forbidden"],
        ['<svg viewBox="0 0 24 24"><path id="icon" d="M0 0" /></svg>', "attribute is forbidden"],
        ['<svg viewBox="0 0 24 24"><path fill="red" d="M0 0" /></svg>', "presentation value is forbidden"],
        ['<svg viewBox="0 0 24 24"><text>Hello</text></svg>', "element is forbidden"],
        ['<!DOCTYPE svg><svg viewBox="0 0 24 24"></svg>', "forbidden XML features"],
    ])("rejects active, addressable or uncontrolled SVG markup", (source, issue) => {
        expect(() => parseInlineSvgAsset(source)).toThrow(issue);
    });
});

describe("cms-svg authored grammar", () => {
    const validate = (html: string) => validateBlocContentMarkup(html, { field: "markup", kind: "fixed" });

    test("requires an empty, accessible, immutable reference", () => {
        expect(() =>
            validate('<svg cms-svg="{{ cms.asset.atlas.icons/check.svg }}" aria-hidden="true"></svg>'),
        ).not.toThrow();
        expect(() => validate('<svg aria-hidden="true"></svg>')).toThrow("requires cms-svg");
        expect(() =>
            validate(
                '<svg cms-svg="{{ cms.asset.atlas.icons/check.svg }}" aria-hidden="true"><path d="M0 0"></path></svg>',
            ),
        ).toThrow("must be empty");
        expect(() => validate('<svg cms-svg="https://example.com/icon.svg" aria-hidden="true"></svg>')).toThrow(
            "immutable collection asset or canonical same-site capability URL",
        );
        expect(() => validate('<svg cms-svg="/.cms/call/%2e%2e/icon" aria-hidden="true"></svg>')).toThrow(
            "ambiguous path segments",
        );
        expect(() => validate('<svg cms-svg="/.cms/call/media/%69con" aria-hidden="true"></svg>')).toThrow(
            "ambiguous path segments",
        );
        expect(() => validate('<svg cms-svg="/.cms/call/media/%5cicon" aria-hidden="true"></svg>')).toThrow(
            "ambiguous path segments",
        );
        expect(() => validate('<svg cms-svg="/prefix/.cms/call/" aria-hidden="true"></svg>')).toThrow(
            "contract and binding path",
        );
        expect(() =>
            validate('<svg cms-svg="/prefix/.cms/call/media/icon/check" aria-hidden="true"></svg>'),
        ).not.toThrow();
        expect(() =>
            validate('<svg cms-svg="{{ cms.asset.atlas.icons/check.svg }}" fill="red" aria-hidden="true"></svg>'),
        ).toThrow('attribute "fill" is not allowed');
    });
});
