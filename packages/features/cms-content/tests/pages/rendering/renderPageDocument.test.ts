import { describe, expect, test } from "bun:test";
import { parseHTML } from "linkedom";
import { renderPageDocument } from "@bernouy/cms-content/rendering";

describe("renderPageDocument", () => {
    test("composes and hardens the same Page document for either surface", async () => {
        const { document } = parseHTML("<html><body></body></html>");
        const rendered = await renderPageDocument(
            document.body,
            { html: '<atlas-card onclick="alert(1)"><script>bad()</script>Hello</atlas-card>' },
            {
                language: "en",
                repository: {
                    async getRenderableBlocs() {
                        return [{ id: "atlas-card", componentHTML: "<article><slot></slot></article>" }];
                    },
                    async getBlocViewJS(tag) {
                        return tag === "atlas-card" ? "customElements.define('atlas-card', class {})" : null;
                    },
                },
                prepareBody(body) {
                    body.setAttribute("data-prepared", "");
                },
            },
        );

        expect(rendered.html).toContain("<atlas-card><article>Hello</article></atlas-card>");
        expect(rendered.html).not.toContain("script");
        expect(rendered.html).not.toContain("onclick");
        expect(rendered.usedTags).toEqual(["atlas-card"]);
        expect(rendered.hasBindingCore).toBe(true);
        expect(document.body.hasAttribute("data-prepared")).toBe(true);
    });
});
