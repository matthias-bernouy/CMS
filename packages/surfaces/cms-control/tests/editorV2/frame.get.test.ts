import { describe, expect, test } from "bun:test";
import getEditorV2Frame from "cms-control/api/editor-v2/frame.get";

function cmsWithPage(page: {
    path: string;
    title: string;
    description: string;
    content: string;
} | null) {
    const requestedPaths: string[] = [];

    const cms = {
        repository: {
            getPage: async (path: string) => {
                requestedPaths.push(path);
                return page && page.path === path
                    ? {
                        id: "page-1",
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
        },
    };

    return { cms, requestedPaths };
}

describe("editor v2 frame endpoint", () => {
    test("renders the requested page into the editor frame", async () => {
        const { cms, requestedPaths } = cmsWithPage({
            path: "/pricing",
            title: "Pricing",
            description: "Pricing page",
            content: "<p>Hello</p>",
        });

        const response = await getEditorV2Frame(
            new Request("http://localhost/cms/api/editor-v2/frame?path=/pricing"),
            cms as any,
        );
        const html = await response.text();

        expect(response.status).toBe(200);
        expect(requestedPaths).toEqual(["/pricing"]);
        expect(html).toContain("<title>Pricing</title>");
        expect(html).toContain("data-cms-editor-root");
        expect(html).toContain("data-cms-content");
        expect(html).toContain("<cms-binding-core>");
        expect(html).toContain("<p>Hello</p>");
        expect(html).toContain("/cms/api/editor/script.js");
    });

    test("returns a visible 404 frame when the page is missing", async () => {
        const { cms } = cmsWithPage(null);

        const response = await getEditorV2Frame(
            new Request("http://localhost/cms/api/editor-v2/frame?path=/missing"),
            cms as any,
        );
        const html = await response.text();

        expect(response.status).toBe(404);
        expect(html).toContain("Page not found");
        expect(html).toContain("/missing");
        expect(html).toContain("data-cms-editor-root");
        expect(html).toContain("data-cms-content");
    });
});
