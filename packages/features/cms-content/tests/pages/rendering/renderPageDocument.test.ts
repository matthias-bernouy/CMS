import { describe, expect, test } from "bun:test";
import { parseHTML } from "linkedom";
import { renderPageDocument } from "@bernouy/cms-content/rendering";

describe("renderPageDocument", () => {
    test("composes and hardens the Page document", async () => {
        const { document } = parseHTML("<html><body></body></html>");
        const rendered = await renderPageDocument(
            document.body,
            { html: '<div cms-bloc=\"atlas-card\" onclick="alert(1)"><script>bad()</script>Hello</div>' },
            {
                language: "en",
                repository: {
                    async getRenderableBlocs() {
                        return [
                            {
                                id: "atlas-card",
                                kind: "component" as const,
                                markupHTML: "<article><slot></slot></article>",
                                uses: ["atlas-action"],
                            },
                            { id: "atlas-action" },
                        ];
                    },
                    async getBlocViewJS(tag) {
                        return ["atlas-action", "atlas-card"].includes(tag)
                            ? `cmsRuntime.registerBloc('${tag}', { mount() {} })`
                            : null;
                    },
                },
                prepareBody(body) {
                    body.setAttribute("data-prepared", "");
                },
            },
        );

        expect(rendered.html).toContain('<div cms-bloc="atlas-card"><article>Hello</article></div>');
        expect(rendered.html).not.toContain("script");
        expect(rendered.html).not.toContain("onclick");
        expect(rendered.usedTags).toEqual(["atlas-action", "atlas-card"]);
        expect(rendered.requiresBindingRuntime).toBe(false);
        expect(rendered.renderableBlocs.map(({ id }) => id)).toEqual(["atlas-card", "atlas-action"]);
        expect(document.body.hasAttribute("data-prepared")).toBe(true);
    });

    test("detects declarative attributes and interpolation that need the binding runtime", async () => {
        for (const html of ['<p cms-condition="state.ready">Ready</p>', "<p>{{ state.title }}</p>"]) {
            const { document } = parseHTML("<html><body></body></html>");
            const rendered = await renderPageDocument(
                document.body,
                { html },
                {
                    language: "en",
                    repository: {
                        getRenderableBlocs: async () => [],
                        getBlocViewJS: async () => null,
                    },
                },
            );

            expect(rendered.requiresBindingRuntime).toBe(true);
        }
    });

    test("expands an admitted SVG source during server rendering", async () => {
        const { document } = parseHTML("<html><body></body></html>");
        const rendered = await renderPageDocument(
            document.body,
            {
                html: '<svg cms-svg="{{ cms.asset.atlas.icons/check.svg }}" aria-hidden="true"></svg>',
            },
            {
                language: "en",
                repository: {
                    getRenderableBlocs: async () => [],
                    getBlocViewJS: async () => null,
                },
                resolveSvgSource: async (source) => {
                    expect(source).toBe("{{ cms.asset.atlas.icons/check.svg }}");
                    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor"><path d="m5 12 4 4L19 6" /></svg>';
                },
            },
        );

        const output = parseHTML(`<html><body>${rendered.html}</body></html>`).document;
        expect(output.querySelector("svg")?.getAttribute("viewBox")).toBe("0 0 24 24");
        expect(output.querySelector("svg")?.getAttribute("fill")).toBe("none");
        expect(output.querySelector("svg")?.getAttribute("stroke")).toBe("currentColor");
        expect(output.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
        expect(output.querySelector("path")?.getAttribute("d")).toBe("m5 12 4 4L19 6");
        expect(rendered.html).not.toContain("cms-svg");
        expect(rendered.requiresBindingRuntime).toBe(false);
    });

    test("resolves repeated SVG sources once", async () => {
        const { document } = parseHTML("<html><body></body></html>");
        let calls = 0;
        const rendered = await renderPageDocument(
            document.body,
            {
                html: Array.from(
                    { length: 10 },
                    () => '<svg cms-svg="{{ cms.asset.atlas.icons/check.svg }}" aria-hidden="true"></svg>',
                ).join(""),
            },
            {
                language: "en",
                repository: {
                    getRenderableBlocs: async () => [],
                    getBlocViewJS: async () => null,
                },
                resolveSvgSource: async () => {
                    calls += 1;
                    return '<svg viewBox="0 0 24 24"><path d="M0 0"></path></svg>';
                },
            },
        );

        expect(calls).toBe(1);
        expect(parseHTML(`<body>${rendered.html}</body>`).document.querySelectorAll("svg")).toHaveLength(10);
    });

    test("rejects documents that exceed the cumulative SVG expansion budget", async () => {
        const { document } = parseHTML("<html><body></body></html>");
        const geometry = Array.from({ length: 255 }, () => '<path d="M0 0"></path>').join("");

        await expect(
            renderPageDocument(
                document.body,
                {
                    html: Array.from(
                        { length: 17 },
                        () => '<svg cms-svg="{{ cms.asset.atlas.icons/dense.svg }}" aria-hidden="true"></svg>',
                    ).join(""),
                },
                {
                    language: "en",
                    repository: {
                        getRenderableBlocs: async () => [],
                        getBlocViewJS: async () => null,
                    },
                    resolveSvgSource: async () => `<svg viewBox="0 0 24 24">${geometry}</svg>`,
                },
            ),
        ).rejects.toThrow("cumulative cms-svg expansion budget");
    });
});
