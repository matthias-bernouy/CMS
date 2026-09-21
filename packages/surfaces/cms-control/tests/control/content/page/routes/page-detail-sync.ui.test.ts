import { afterEach, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import "cms-control/components";

const originalFetch = globalThis.fetch;

afterEach(() => {
    globalThis.fetch = originalFetch;
    document.body.replaceChildren();
    document.head.replaceChildren();
    window.history.replaceState(null, "", "/");
});

test("page actions open their panels and both saves keep the bound detail mounted", async () => {
    const pathDetail = {
        id: "page-1",
        paths: { en: "/pricing" },
        languages: [{ code: "en", active: true, default: true, publicPath: "/pricing" }],
    };
    const settingsWrites: Record<string, unknown>[] = [];
    globalThis.fetch = (async (input: string | URL | Request, init?: RequestInit) => {
        const url = String(input instanceof Request ? input.url : input);
        if (url.includes("/api/page/paths")) {
            if (init?.method === "PUT") {
                pathDetail.paths = (JSON.parse(String(init.body)) as typeof pathDetail).paths;
                pathDetail.languages[0]!.publicPath = pathDetail.paths.en;
            }
            return Response.json(pathDetail);
        }
        if (url.includes("/api/page/seo")) {
            return Response.json({
                id: "page-1",
                defaultLanguage: "en",
                defaults: { title: "Pricing", description: "Pricing page" },
                languages: ["en"],
                translations: { en: {} },
            });
        }
        if (url.includes("/api/page/exists")) {
            return Response.json({ exists: false });
        }
        if (url.includes("/api/page/list") || url.includes("/api/tags")) {
            return Response.json([]);
        }
        if (init?.method === "PUT" && url.includes("/api/page/configDetail")) {
            settingsWrites.push(JSON.parse(String(init.body)) as Record<string, unknown>);
            return Response.json({ id: "page-1" });
        }
        return Response.json({
            id: "page-1",
            title: "Pricing",
            description: "Pricing page",
            path: "/pricing",
            publicUrl: "https://site.test/pricing",
            tags: [],
            published: true,
            indexingEditor: {
                configured: false,
                suggested: false,
                detectionStatus: "none",
                enabled: false,
                selection: "",
                selectionValid: true,
                availableVariables: [],
                candidates: [],
            },
        });
    }) as typeof fetch;

    window.history.replaceState(null, "", "/admin/pages/detail?id=page-1");
    document.head.innerHTML = '<meta name="basePath" content="">';
    const html = readFileSync(
        join(import.meta.dir, "../../../../../src/static/admin/_content/pages/detail.html"),
        "utf8",
    );
    document.body.innerHTML = `<cms-binding-core>${html.replaceAll("{{BASE_PATH}}", "")}</cms-binding-core>`;
    await waitFor(() => document.querySelector("cms-shell-detail") !== null);

    const shell = document.querySelector("cms-shell-detail")!;
    const menu = document.querySelector("p9r-action-menu")!;
    menu.shadowRoot?.querySelector<HTMLButtonElement>("[data-trigger]")?.click();
    expect(menu.hasAttribute("open")).toBe(true);
    document.querySelector<HTMLElement>('[data-modal-target="manage-page-languages-modal"]')!.click();
    expect(document.querySelector("#manage-page-languages-modal")?.hasAttribute("open")).toBe(true);
    expect(menu.hasAttribute("open")).toBe(false);

    const title = document.querySelector<HTMLElement & { value: string }>('p9r-input[name="title"]')!;
    title.value = "New pricing";
    const form = document.querySelector<HTMLFormElement>("#page-settings-form")!;
    const submit = new Event("submit", { bubbles: true, cancelable: true });
    form.dispatchEvent(submit);
    expect(submit.defaultPrevented).toBe(true);
    await waitFor(() => settingsWrites.length === 1);
    await waitFor(() => shell.querySelector('[slot="title"]')?.textContent === "New pricing");
    expect(settingsWrites[0]?.title).toBe("New pricing");
    expect(document.querySelector("cms-shell-detail")).toBe(shell);
    expect(shell.querySelector('[slot="title"]')?.textContent).toBe("New pricing");
    await waitFor(() => document.querySelector('[role="status"]')?.textContent === "Settings saved.");
    expect(window.location.pathname).toBe("/admin/pages/detail");
    await waitFor(() => document.querySelector('cms-page-languages p9r-input[name="en.title"]') !== null);
    expect(document.querySelector('cms-page-languages p9r-input[name="en.title"]')?.getAttribute("placeholder")).toBe(
        "New pricing",
    );

    await waitFor(() => document.querySelector('cms-page-languages .page-language-row p9r-input[name="en"]') !== null);
    const pathInput = document.querySelector<HTMLElement & { value: string }>(
        'cms-page-languages .page-language-row p9r-input[name="en"]',
    )!;
    pathInput.value = "/plans";
    pathInput.dispatchEvent(new Event("input", { bubbles: true }));
    document
        .querySelector<HTMLFormElement>("cms-page-languages form")!
        .dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    await waitFor(
        () => document.querySelector<HTMLElement & { value: string }>('p9r-input[name="path"]')?.value === "/plans",
    );
    expect(document.querySelector("cms-shell-detail")).toBe(shell);
    expect(document.querySelector('[data-action="view-public"]')?.getAttribute("href")).toBe("https://site.test/plans");
    expect(window.location.pathname).toBe("/admin/pages/detail");

    document.querySelector<HTMLElement>("#manage-page-languages-modal")?.removeAttribute("open");
    menu.shadowRoot?.querySelector<HTMLButtonElement>("[data-trigger]")?.click();
    document.querySelector<HTMLElement>('[data-modal-target="delete-page-modal"]')!.click();
    expect(document.querySelector("#delete-page-modal")?.hasAttribute("open")).toBe(true);
    expect(menu.hasAttribute("open")).toBe(false);
});

test("path updates preserve a relative public link", () => {
    document.body.innerHTML = `
        <cms-page-detail-sync>
            <p9r-input name="path" value="/en/old" readonly></p9r-input>
            <p9r-action-menu-item data-action="view-public" href="/en/old">View public page</p9r-action-menu-item>
        </cms-page-detail-sync>
    `;
    document
        .querySelector("cms-page-detail-sync")!
        .dispatchEvent(new CustomEvent("page:paths-saved", { detail: { primaryPath: "/en/new" } }));

    expect(document.querySelector<HTMLElement & { value: string }>('p9r-input[name="path"]')?.value).toBe("/en/new");
    expect(document.querySelector('p9r-action-menu-item[data-action="view-public"]')?.getAttribute("href")).toBe(
        "/en/new",
    );
});

async function waitFor(predicate: () => boolean): Promise<void> {
    for (let attempt = 0; attempt < 50; attempt += 1) {
        if (predicate()) {
            return;
        }
        await new Promise((resolve) => setTimeout(resolve, 0));
    }
    throw new Error("UI state did not settle.");
}
