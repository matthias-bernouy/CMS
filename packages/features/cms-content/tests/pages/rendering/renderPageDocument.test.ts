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
});
