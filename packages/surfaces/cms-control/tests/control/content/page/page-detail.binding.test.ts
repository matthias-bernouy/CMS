import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import "cms-control/components";

const realFetch = globalThis.fetch;
const realConfirm = globalThis.confirm;

afterEach(() => {
    globalThis.fetch = realFetch;
    globalThis.confirm = realConfirm;
    document.body.replaceChildren();
    window.history.replaceState(null, "", "/");
});

describe("admin page detail", () => {
    test("renders page settings, content editing, and deletion as separate actions", async () => {
        globalThis.fetch = mockPageDetailFetch();

        window.history.replaceState(null, "", "/admin/pages/detail?id=page-1");
        document.head.innerHTML = '<meta name="basePath" content="">';
        document.body.innerHTML = `<cms-binding-core>${pageDetailHtml()}</cms-binding-core>`;

        await waitFor(() => document.querySelector("cms-shell-detail") !== null);

        expect(document.querySelector("cms-shell-detail")).not.toBeNull();
        expect(document.querySelector('form[action="/editor/page"] input[name="id"]')?.getAttribute("value")).toBe(
            "page-1",
        );
        const settingsForm = document.querySelector('#page-settings-form[cms-source^="/api/page/configDetail"]');
        expect(settingsForm?.getAttribute("cms-source-method")).toBe("PUT");
        expect(settingsForm?.getAttribute("cms-source-success-redirect")).toBe(
            "/admin/pages/detail?id={{ result.body.id }}",
        );
        expect(document.querySelector('p9r-button[form="page-settings-form"]')?.textContent).toContain("Save settings");
        expect(document.querySelector('p9r-action-menu-item[data-action="view-public"]')?.getAttribute("href")).toBe(
            "https://site.test/pricing",
        );
        expect(document.querySelector('p9r-action-menu-item[data-action="view-public"]')?.textContent).toContain(
            "View public page",
        );
        expect(
            document.querySelector('p9r-action-menu[label="More actions"] [data-action="delete"]')?.textContent,
        ).toContain("Delete page");
        expect(document.querySelector('p9r-input[name="title"]')?.getAttribute("value")).toBe("Pricing");
        expect(
            document
                .querySelector('cms-detail-section[heading="Page configuration"] p9r-input[name="path"]')
                ?.getAttribute("form"),
        ).toBe("page-settings-form");
        expect(document.querySelector('p9r-select[name="published"]')?.getAttribute("form")).toBe("page-settings-form");
        expect(document.querySelector('p9r-token-input[name="tags"]')?.getAttribute("value")).toBe("pricing,landing");
        expect(document.querySelector('p9r-token-input[name="tags"]')?.getAttribute("resource")).toBe("pages");
        expect(document.querySelector('p9r-token-input[name="tags"]')?.getAttribute("form")).toBe("page-settings-form");
        expect(document.querySelector('p9r-token-input[name="tags"]')?.hasAttribute("creatable")).toBe(true);
        expect(document.querySelector('cms-confirm-form[method="DELETE"]')?.getAttribute("target")).toBe(
            "/api/page?id=page-1",
        );
    });

    test("allows a destructive action-menu item to trigger the confirmation request", async () => {
        let request: { method: string; url: string } | undefined;
        globalThis.confirm = () => true;
        globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
            request = {
                method: init?.method ?? "GET",
                url: String(input instanceof Request ? input.url : input),
            };
            return new Response(null, { status: 204 });
        }) as typeof fetch;
        document.body.innerHTML = `
            <cms-confirm-form trigger-selector="[data-action=delete]" target="/api/page?id=page-1" method="DELETE">
                <p9r-action-menu-item data-action="view-public">View public page</p9r-action-menu-item>
                <p9r-action-menu-item data-action="delete" color="danger">Delete page</p9r-action-menu-item>
            </cms-confirm-form>
        `;

        (document.querySelector('[data-action="view-public"]') as HTMLElement | null)?.click();
        expect(request).toBeUndefined();
        (document.querySelector('[data-action="delete"]') as HTMLElement | null)?.click();
        await waitFor(() => request !== undefined);

        expect(request).toEqual({ method: "DELETE", url: "/api/page?id=page-1" });
    });
});

function mockPageDetailFetch(): typeof fetch {
    return (async (input: string | URL | Request) => {
        const url = String(input instanceof Request ? input.url : input);
        if (url.includes("/api/tags")) {
            return Response.json([
                { value: "pricing", count: 1 },
                { value: "landing", count: 1 },
            ]);
        }
        return Response.json({
            id: "page-1",
            title: "Pricing",
            description: "Pricing page",
            path: "/pricing",
            publicUrl: "https://site.test/pricing",
            tags: ["pricing", "landing"],
            published: true,
        });
    }) as unknown as typeof fetch;
}

function pageDetailHtml(): string {
    const path = join(import.meta.dir, "../../../../src/static/admin/_content/pages/detail.html");
    return readFileSync(path, "utf8").replaceAll("{{BASE_PATH}}", "");
}

async function waitFor(predicate: () => boolean, tries = 50): Promise<void> {
    for (let index = 0; index < tries; index += 1) {
        if (predicate()) {
            return;
        }
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
}
