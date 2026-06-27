import { describe, expect, test } from "bun:test";
import getEditorFrame from "cms-control/api/editor/frame.get";
import { cmsWithReusableDocument } from "./frameTestUtils";

describe("editor frame endpoint - reusable documents", () => {
    test("renders template content into the editor frame", async () => {
        const { cms, requestedIds } = cmsWithReusableDocument("template", {
            id:          "template-1",
            identifier:  "hero-template",
            name:        "Hero template",
            description: "Template description",
            category:    "Hero",
            content:     `<section><p>Template content</p></section>`,
        });
        const response = await getEditorFrame(
            new Request("http://localhost/cms/api/editor/frame?type=template&id=template-1"),
            cms as any,
        );
        const html = await response.text();

        expect(response.status).toBe(200);
        expect(requestedIds).toEqual(["template-1"]);
        expect(html).toContain("<title>Hero template</title>");
        expect(html).toContain("data-cms-content");
        expect(html).toContain(`<cms-binding-core cms-binding-disabled cms-source-state-force="loading">`);
        expect(html).toContain("<section><p>Template content</p></section>");
        expect(html).toContain("/cms/api/editor/binding-core.js");
        expect(html).toContain("/cms/api/editor/view-script.js");
    });

    test("renders snippet content into the editor frame", async () => {
        const { cms, requestedIds } = cmsWithReusableDocument("snippet", {
            id:          "snippet-1",
            identifier:  "main-nav",
            name:        "Main nav",
            description: "Snippet description",
            category:    "Navigation",
            content:     `<nav>Snippet content</nav>`,
        });
        const response = await getEditorFrame(
            new Request("http://localhost/cms/api/editor/frame?type=snippet&id=snippet-1"),
            cms as any,
        );
        const html = await response.text();

        expect(response.status).toBe(200);
        expect(requestedIds).toEqual(["snippet-1"]);
        expect(html).toContain("<title>Main nav</title>");
        expect(html).toContain("data-cms-content");
        expect(html).toContain(`<cms-binding-core cms-binding-disabled cms-source-state-force="loading">`);
        expect(html).toContain("<nav>Snippet content</nav>");
    });

    test("sanitizes reusable document content before rendering the frame", async () => {
        const { cms } = cmsWithReusableDocument("snippet", {
            id:          "snippet-1",
            identifier:  "main-nav",
            name:        "Main nav",
            description: "Snippet description",
            category:    "Navigation",
            content:     `<svg><image href="data:image/svg+xml;base64,PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+"></image></svg><p onclick="alert(1)">Safe text</p>`,
        });
        const response = await getEditorFrame(
            new Request("http://localhost/cms/api/editor/frame?type=snippet&id=snippet-1"),
            cms as any,
        );
        const html = await response.text();

        expect(response.status).toBe(200);
        expect(html).toContain("Safe text");
        expect(html).not.toContain("onclick");
        expect(html).not.toContain("data:image/svg+xml");
    });
});
