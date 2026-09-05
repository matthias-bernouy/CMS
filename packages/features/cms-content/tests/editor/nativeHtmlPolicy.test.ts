import { describe, expect, test } from "bun:test";
import {
    ContentValidationError,
    isNativeHtmlTag,
    isPlatformNativeEditorTag,
    isSiteBlocNativeStructureTag,
    validateSiteBlocSnapshot,
} from "@bernouy/cms-content";
import { siteBlocSnapshot } from "../blocs/siteBlocFixture";

describe("platform native HTML policy", () => {
    test("separates native integration roots, editor entries and safe site structure", () => {
        expect(isNativeHtmlTag("div")).toBe(true);
        expect(isNativeHtmlTag("script")).toBe(true);
        expect(isNativeHtmlTag("mossa-card")).toBe(false);
        expect(isPlatformNativeEditorTag("h1")).toBe(true);
        expect(isPlatformNativeEditorTag("span")).toBe(true);
        expect(isPlatformNativeEditorTag("main")).toBe(false);
        expect(isSiteBlocNativeStructureTag("main")).toBe(true);
        expect(isSiteBlocNativeStructureTag("strong")).toBe(true);
        expect(isSiteBlocNativeStructureTag("form")).toBe(false);
        expect(isSiteBlocNativeStructureTag("div")).toBe(false);
        expect(isSiteBlocNativeStructureTag("table")).toBe(false);
    });

    test("keeps semantic native structure out of published artifact dependencies", () => {
        const snapshot = validateSiteBlocSnapshot(
            siteBlocSnapshot({
                structure: [
                    {
                        kind: "bloc",
                        tag: "header",
                        attributes: {},
                        children: [
                            {
                                kind: "bloc",
                                tag: "mossa-navigation",
                                attributes: {},
                                children: [{ kind: "bloc", tag: "span", attributes: { slot: "label" }, children: [] }],
                            },
                            {
                                kind: "bloc",
                                tag: "nav",
                                attributes: {},
                                children: [
                                    {
                                        kind: "bloc",
                                        tag: "a",
                                        attributes: { href: "/" },
                                        children: [
                                            {
                                                kind: "bloc",
                                                tag: "strong",
                                                attributes: {},
                                                children: [{ kind: "bloc", tag: "em", attributes: {}, children: [] }],
                                            },
                                        ],
                                    },
                                ],
                            },
                        ],
                    },
                ],
            }),
        );

        expect(snapshot.dependencies).toEqual(["mossa-navigation"]);
    });

    test("allows contextual native nodes as direct custom-element children", () => {
        const snapshot = validateSiteBlocSnapshot(
            siteBlocSnapshot({
                structure: [
                    {
                        kind: "bloc",
                        tag: "fixture-grade",
                        attributes: {},
                        children: [
                            { kind: "bloc", tag: "span", attributes: {}, children: [] },
                            { kind: "bloc", tag: "li", attributes: { slot: "criteria" }, children: [] },
                            { kind: "bloc", tag: "strong", attributes: { slot: "title" }, children: [] },
                        ],
                    },
                ],
            }),
        );

        expect(snapshot.dependencies).toEqual(["fixture-grade"]);
    });

    test.each([
        [{ kind: "bloc", tag: "div", attributes: {}, children: [] }, "invalid bloc tag"],
        [{ kind: "bloc", tag: "li", attributes: {}, children: [] }, "direct child"],
        [{ kind: "bloc", tag: "span", attributes: {}, children: [] }, "explicit component text slot"],
        [{ kind: "bloc", tag: "strong", attributes: {}, children: [] }, "inside rich text"],
        [{ kind: "bloc", tag: "h1", attributes: { class: "hero" }, children: [] }, "not allowed"],
        [{ kind: "bloc", tag: "a", attributes: { "data-track": "cta" }, children: [] }, "not allowed"],
    ] as const)("rejects native structure outside the platform policy", (node, message) => {
        expect(() => validateSiteBlocSnapshot(siteBlocSnapshot({ structure: [node] }))).toThrow(new RegExp(message));
        expect(() => validateSiteBlocSnapshot(siteBlocSnapshot({ structure: [node] }))).toThrow(ContentValidationError);
    });

    test.each([
        [{ kind: "bloc", tag: "a", attributes: { target: "_self" }, children: [] }, "target"],
        [
            { kind: "bloc", tag: "a", attributes: { href: "java\nscript:alert(1)" }, children: [] },
            "forbidden URL scheme",
        ],
        [
            { kind: "bloc", tag: "a", attributes: { href: "data:text/html,<script>attack()</script>" }, children: [] },
            "forbidden URL scheme",
        ],
        [
            { kind: "bloc", tag: "a", attributes: { target: "_blank", rel: "nofollow" }, children: [] },
            "noopener noreferrer",
        ],
        [{ kind: "bloc", tag: "button", attributes: { type: "reset" }, children: [] }, "button type"],
        [
            { kind: "bloc", tag: "img", attributes: { src: "/.cms/files/by-id/photo" }, children: [] },
            "alternative text",
        ],
        [
            {
                kind: "bloc",
                tag: "img",
                attributes: {
                    src: "https://attacker.example/.cms/files/by-id/photo",
                    alt: "Photo",
                },
                children: [],
            },
            "CMS media item",
        ],
        [
            {
                kind: "bloc",
                tag: "img",
                attributes: { src: "/.cms/files/by-id/photo", alt: "Photo", loading: "auto" },
                children: [],
            },
            "loading",
        ],
        [{ kind: "bloc", tag: "svg", attributes: {}, children: [] }, "decorative native SVG"],
        [{ kind: "bloc", tag: "svg", attributes: { role: "img" }, children: [] }, "accessible label"],
        [{ kind: "bloc", tag: "section", attributes: { "aria-label": "" }, children: [] }, "must not be empty"],
        [
            {
                kind: "bloc",
                tag: "img",
                attributes: { src: "/.cms/files/by-id/photo", alt: "Photo" },
                children: [{ kind: "text", value: "forged child" }],
            },
            "cannot contain children",
        ],
        [
            {
                kind: "bloc",
                tag: "button",
                attributes: {},
                children: [{ kind: "bloc", tag: "strong", attributes: {}, children: [] }],
            },
            "inside rich text",
        ],
    ] as const)("rejects uncontrolled native attribute values", (node, message) => {
        expect(() => validateSiteBlocSnapshot(siteBlocSnapshot({ structure: [node] }))).toThrow(new RegExp(message));
    });

    test("accepts the controlled informative and decorative media states", () => {
        expect(
            validateSiteBlocSnapshot(
                siteBlocSnapshot({
                    structure: [
                        {
                            kind: "bloc",
                            tag: "img",
                            attributes: {
                                src: "/.cms/files/by-id/photo",
                                alt: "Product photo",
                                loading: "lazy",
                                fetchpriority: "auto",
                                width: "640",
                                height: "480",
                            },
                            children: [],
                        },
                        {
                            kind: "bloc",
                            tag: "img",
                            attributes: {
                                src: "/.cms/files/by-id/texture",
                                role: "presentation",
                                "aria-hidden": "true",
                                alt: "",
                            },
                            children: [],
                        },
                        {
                            kind: "bloc",
                            tag: "svg",
                            attributes: { role: "img", "aria-label": "Company logo" },
                            children: [],
                        },
                        {
                            kind: "bloc",
                            tag: "svg",
                            attributes: { "aria-hidden": "true" },
                            children: [],
                        },
                    ],
                }),
            ).structure,
        ).toHaveLength(4);
    });
});
