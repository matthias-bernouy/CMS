import { describe, expect, test } from "bun:test";
import getEditorFrame from "cms-control/api/editor/frame.get";

function cmsWithPage(page: {
    id: string;
    path: string;
    title: string;
    description: string;
    content: string;
} | null, snippets: Record<string, string> = {}) {
    const requestedIds: string[] = [];
    const requestedPaths: string[] = [];

    const cms = {
        repository: {
            getPageById: async (id: string) => {
                requestedIds.push(id);
                return page && page.id === id
                    ? {
                        visible: true,
                        tags: [],
                        ...page,
                    }
                    : null;
            },
            getPage: async (path: string) => {
                requestedPaths.push(path);
                return page && page.path === path
                    ? {
                        visible: true,
                        tags: [],
                        ...page,
                    }
                    : null;
            },
            getSystem: async () => ({
                editor: {
                    shell: "<cms-binding-core>{{CONTENT}}</cms-binding-core>",
                },
            }),
            getSnippetByIdentifier: async (identifier: string) => snippets[identifier]
                ? { content: snippets[identifier] }
                : null,
        },
    };

    return { cms, requestedIds, requestedPaths };
}

function cmsWithReusableDocument(kind: "template" | "snippet", document: {
    id: string;
    identifier: string;
    name: string;
    description: string;
    category: string;
    content: string;
} | null, snippets: Record<string, string> = {}) {
    const requestedIds: string[] = [];

    const cms = {
        repository: {
            getTemplateById: async (id: string) => {
                if (kind !== "template") return null;
                requestedIds.push(id);
                return document && document.id === id ? document : null;
            },
            getSnippetById: async (id: string) => {
                if (kind !== "snippet") return null;
                requestedIds.push(id);
                return document && document.id === id ? document : null;
            },
            getSnippetByIdentifier: async (identifier: string) => snippets[identifier]
                ? { content: snippets[identifier] }
                : null,
        },
    };

    return { cms, requestedIds };
}

describe("editor frame endpoint", () => {
    test("renders the requested page id into the editor frame", async () => {
        const { cms, requestedIds, requestedPaths } = cmsWithPage({
            id: "page-1",
            path: "/pricing",
            title: "Pricing",
            description: "Pricing page",
            content: "<p>Hello</p>",
        });

        const response = await getEditorFrame(
            new Request("http://localhost/cms/api/editor/frame?id=page-1"),
            cms as any,
        );
        const html = await response.text();

        expect(response.status).toBe(200);
        expect(requestedIds).toEqual(["page-1"]);
        expect(requestedPaths).toEqual([]);
        expect(html).toContain("<title>Pricing</title>");
        expect(html).toContain("data-cms-editor-root");
        expect(html).toContain("data-cms-content");
        expect(html).toContain("<cms-binding-core>");
        expect(html).toContain("<p>Hello</p>");
        expect(html).toContain("/cms/api/editor/component.js");
        expect(html).toContain("/cms/api/editor/binding-core.js");
        expect(html).toContain("/cms/api/editor/view-script.js");
        expect(html).not.toContain("/cms/assets/control-components.js");
        expect(html).not.toContain("/cms/api/editor/script.js");
    });

    test("expands snippets before rendering the frame", async () => {
        const { cms } = cmsWithPage({
            id: "page-1",
            path: "/pricing",
            title: "Pricing",
            description: "Pricing page",
            content: `<w13c-snippet identifier="hero">stale</w13c-snippet>`,
        }, {
            hero: "<p>Expanded hero</p>",
        });

        const response = await getEditorFrame(
            new Request("http://localhost/cms/api/editor/frame?id=page-1"),
            cms as any,
        );
        const html = await response.text();

        expect(response.status).toBe(200);
        expect(html).toContain(`<w13c-snippet identifier="hero"><p>Expanded hero</p></w13c-snippet>`);
        expect(html).not.toContain("stale");
    });

    test("redirects to pages admin when the page is missing", async () => {
        const { cms } = cmsWithPage(null);

        const response = await getEditorFrame(
            new Request("http://localhost/cms/api/editor/frame?id=missing-id"),
            cms as any,
        );

        expect(response.status).toBe(302);
        expect(response.headers.get("location")).toBe("/cms/admin/pages");
    });

    test("keeps path loading as a temporary fallback", async () => {
        const { cms, requestedIds, requestedPaths } = cmsWithPage({
            id: "page-1",
            path: "/pricing",
            title: "Pricing",
            description: "Pricing page",
            content: "<p>Hello</p>",
        });

        const response = await getEditorFrame(
            new Request("http://localhost/cms/api/editor/frame?path=/pricing"),
            cms as any,
        );

        expect(response.status).toBe(200);
        expect(requestedIds).toEqual([]);
        expect(requestedPaths).toEqual(["/pricing"]);
    });

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
        expect(html).toContain("<section><p>Template content</p></section>");
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
        expect(html).toContain("<nav>Snippet content</nav>");
    });
});
