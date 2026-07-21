import { describe, expect, test } from "bun:test";
import getEditorFrame from "cms-control/api/editor/frame.get";
import { cmsWithPage, pricingPage } from "./frameTestUtils";

describe("editor frame endpoint - pages", () => {
    test("renders the requested page id into the editor frame", async () => {
        const { cms, requestedIds, requestedPaths } = cmsWithPage(pricingPage());
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
        expect(html).toContain(`<cms-binding-core cms-binding-disabled cms-source-state-force="loading">`);
        expect(html).toContain("<p>Hello</p>");
        expect(html).toContain("/cms/api/editor/component.js");
        expect(html).toContain("/cms/api/editor/binding-core.js");
        expect(html).toContain("/cms/api/editor/view-script.js");
        expect(html).not.toContain("/cms/assets/control-components.js");
        expect(html).not.toContain("/cms/api/editor/script.js");
    });

    test("renders stored content directly without resolving reserved custom elements", async () => {
        const { cms } = cmsWithPage(pricingPage(`<w13c-reserved-example data-id="hero">stale</w13c-reserved-example>`));
        const response = await getEditorFrame(
            new Request("http://localhost/cms/api/editor/frame?id=page-1"),
            cms as any,
        );
        const html = await response.text();

        expect(response.status).toBe(200);
        expect(html).toContain(`<w13c-reserved-example data-id="hero">stale</w13c-reserved-example>`);
    });

    test("defers editor runtimes until authored custom-element children are parsed", async () => {
        const { cms } = cmsWithPage(pricingPage());
        const response = await getEditorFrame(
            new Request("http://localhost/cms/api/editor/frame?id=page-1"),
            cms as any,
        );
        const html = await response.text();

        const component = html.indexOf(`<script defer src="/cms/api/editor/component.js"></script>`);
        const binding = html.indexOf(`<script defer src="/cms/api/editor/binding-core.js"></script>`);
        const view = html.indexOf(`<script defer src="/cms/api/editor/view-script.js"></script>`);

        expect(component).toBeGreaterThan(-1);
        expect(binding).toBeGreaterThan(component);
        expect(view).toBeGreaterThan(binding);
    });

    test("sanitizes stored HTML before rendering the frame", async () => {
        const { cms } = cmsWithPage(
            pricingPage(`
            <a href="javascript:alert(1)">bad link</a>
            <iframe srcdoc="<script>alert(1)</script>"></iframe>
            <w13c-reserved-example data-id="hero">stale</w13c-reserved-example>
        `),
        );
        const response = await getEditorFrame(
            new Request("http://localhost/cms/api/editor/frame?id=page-1"),
            cms as any,
        );
        const html = await response.text();

        expect(response.status).toBe(200);
        expect(html).not.toContain("<script>alert");
        expect(html).not.toContain("onerror");
        expect(html).not.toContain("javascript:alert");
        expect(html).not.toContain("srcdoc");
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
        const { cms, requestedIds, requestedPaths } = cmsWithPage(pricingPage());
        const response = await getEditorFrame(
            new Request("http://localhost/cms/api/editor/frame?path=/pricing"),
            cms as any,
        );

        expect(response.status).toBe(200);
        expect(requestedIds).toEqual([]);
        expect(requestedPaths).toEqual(["/pricing"]);
    });

    test("wraps page content directly in the editor binding core", async () => {
        const { cms } = cmsWithPage(pricingPage());
        const response = await getEditorFrame(
            new Request("http://localhost/cms/api/editor/frame?id=page-1"),
            cms as any,
        );
        const html = await response.text();

        expect(response.status).toBe(200);
        expect(html).toContain(
            `<div data-cms-editor-root style="display:contents"><cms-binding-core cms-binding-disabled cms-source-state-force="loading">`,
        );
        expect(html).toContain(`<div data-cms-content="" style="display:contents"><p>Hello</p></div>`);
        expect(html).toContain("/cms/api/editor/binding-core.js");
    });
});
