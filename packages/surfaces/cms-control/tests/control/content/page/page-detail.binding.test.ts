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
        expect(document.querySelector('p9r-input[name="title"]')?.getAttribute("maxlength")).toBe("70");
        expect(document.querySelector('p9r-textarea[name="description"]')?.getAttribute("maxlength")).toBe("200");
        expect(
            document.querySelector('form#page-settings-form cms-detail-section[heading="Page settings"]'),
        ).not.toBeNull();
        expect(document.querySelector('form#page-settings-form cms-detail-section[heading="Indexing"]')).not.toBeNull();
        expect(
            document
                .querySelector('cms-detail-section[heading="Page configuration"] p9r-input[name="path"]')
                ?.getAttribute("form"),
        ).toBe("page-settings-form");
        expect(document.querySelector('p9r-input[name="path"]')?.hasAttribute("hint")).toBe(true);
        expect(document.querySelector('p9r-input[name="path"]')?.hasAttribute("help")).toBe(true);
        expect(document.querySelector('cms-page-form-controller[mode="edit"]')?.getAttribute("current-path")).toBe(
            "/pricing",
        );
        expect(document.querySelector('p9r-select[name="published"]')?.getAttribute("form")).toBe("page-settings-form");
        expect(document.querySelector('p9r-token-input[name="tags"]')?.getAttribute("value")).toBe("pricing,landing");
        expect(document.querySelector('p9r-token-input[name="tags"]')?.getAttribute("resource")).toBe("pages");
        expect(document.querySelector('p9r-token-input[name="tags"]')?.getAttribute("form")).toBe("page-settings-form");
        expect(document.querySelector('p9r-token-input[name="tags"]')?.hasAttribute("creatable")).toBe(true);
        const indexing = document.querySelector("cms-page-indexing-settings");
        await waitFor(() => indexing?.shadowRoot?.querySelector(".binding") !== null);
        expect((document.querySelector('p9r-input[name="title"]') as HTMLElement & { value: string }).value).toBe(
            "${content.title}",
        );
        expect(
            (document.querySelector('p9r-textarea[name="description"]') as HTMLElement & { value: string }).value,
        ).toBe("Buy ${content.title}");
        expect(
            (document.querySelector("[data-indexing-variables]") as HTMLElement & { value: string }).value,
        ).toContain("${content.title}");
        expect(
            (document.querySelector("[data-page-indexing-toggle]") as HTMLElement & { checked: boolean }).checked,
        ).toBe(true);
        expect(indexing?.querySelector<HTMLInputElement>('[name="indexingEnabled"]')?.value).toBe("true");
        expect(indexing?.querySelector<HTMLInputElement>('[name="indexingCandidate"]')?.value).toBe(
            "urn%3Acommerce|product-by-slug|product",
        );
        const indexingToggle = document.querySelector("[data-page-indexing-toggle]") as HTMLElement & {
            checked: boolean;
        };
        indexingToggle.checked = false;
        indexingToggle.dispatchEvent(new Event("change"));
        expect(indexing?.hasAttribute("data-disabled")).toBe(true);
        expect(indexing?.shadowRoot?.querySelector(".value")?.textContent).toBe("Product");
        expect(indexing?.querySelector<HTMLInputElement>('[name="indexingCandidate"]')?.value).toBe(
            "urn%3Acommerce|product-by-slug|product",
        );
        expect(
            (document.querySelector("[data-indexing-variables]") as HTMLElement & { value: string }).value,
        ).toContain("${site.name}");
        expect(document.querySelector('cms-confirm-form[method="DELETE"]')?.getAttribute("target")).toBe(
            "/api/page?id=page-1",
        );
    });

    test("does not submit an ambiguous binding until the user selects it", async () => {
        const form = document.createElement("form");
        const indexing = document.createElement("cms-page-indexing-settings");
        indexing.setAttribute(
            "value",
            JSON.stringify({
                configured: false,
                suggested: false,
                detectionStatus: "ambiguous",
                enabled: false,
                selection: "",
                selectionValid: true,
                availableVariables: ["site.name"],
                candidates: [
                    {
                        value: "urn%3Acommerce|product-by-slug|item",
                        label: "Product",
                        variables: ["content.title"],
                        suggestedTitle: "${content.title}",
                        suggestedDescription: "Buy ${content.title}",
                    },
                    {
                        value: "urn%3Aevents|event-by-slug|item",
                        label: "Event",
                        variables: ["content.name"],
                        suggestedTitle: "${content.name}",
                        suggestedDescription: "",
                    },
                ],
            }),
        );
        form.append(indexing);
        document.body.append(form);
        await waitFor(() => indexing.shadowRoot?.querySelector("[data-candidate]") !== null);

        expect(indexing.querySelector<HTMLInputElement>('[name="indexingEnabled"]')?.disabled).toBe(true);
        expect(indexing.hasAttribute("data-disabled")).toBe(true);

        const candidate = indexing.shadowRoot?.querySelector<HTMLElement & { value: string }>("[data-candidate]");
        candidate!.value = "urn%3Aevents|event-by-slug|item";
        candidate!.dispatchEvent(new Event("change"));

        const enabledField = indexing.querySelector<HTMLInputElement>('[name="indexingEnabled"]');
        const candidateField = indexing.querySelector<HTMLInputElement>('[name="indexingCandidate"]');
        expect(enabledField?.disabled).toBe(false);
        expect(enabledField?.value).toBe("false");
        expect(candidateField?.disabled).toBe(false);
        expect(candidateField?.value).toBe("urn%3Aevents|event-by-slug|item");
    });

    test("keeps persisted metadata variables literal when the detail reloads", async () => {
        globalThis.fetch = mockPageDetailFetch({
            title: "Product — ${content.title}",
            description: "From ${site.name}",
            configured: true,
            suggested: false,
        });
        window.history.replaceState(null, "", "/admin/pages/detail?id=page-1");
        document.head.innerHTML = '<meta name="basePath" content="">';
        document.body.innerHTML = `<cms-binding-core>${pageDetailHtml()}</cms-binding-core>`;

        await waitFor(() => document.querySelector("cms-page-indexing-settings") !== null);

        expect((document.querySelector('p9r-input[name="title"]') as HTMLElement & { value: string }).value).toBe(
            "Product — ${content.title}",
        );
        expect(
            (document.querySelector('p9r-textarea[name="description"]') as HTMLElement & { value: string }).value,
        ).toBe("From ${site.name}");
    });

    test("shows an indexing switch without entity controls for a static page", async () => {
        const form = document.createElement("form");
        const section = document.createElement("cms-detail-section");
        const toggle = document.createElement("w13c-switch") as HTMLElement & { checked: boolean };
        toggle.slot = "actions";
        toggle.dataset.pageIndexingToggle = "";
        const variables = document.createElement("cms-page-indexing-variables") as HTMLElement & { value: string };
        variables.dataset.indexingVariables = "";
        variables.hidden = true;
        const indexing = document.createElement("cms-page-indexing-settings");
        indexing.setAttribute(
            "value",
            JSON.stringify({
                configured: false,
                suggested: false,
                detectionStatus: "none",
                enabled: true,
                selection: "",
                selectionValid: true,
                availableVariables: ["site.name"],
                candidates: [],
            }),
        );
        section.append(toggle, indexing);
        form.append(variables, section);
        document.body.append(form);
        await waitFor(() => indexing.shadowRoot !== null);

        expect(toggle.checked).toBe(true);
        expect(toggle.shadowRoot?.querySelector<HTMLInputElement>("input")?.checked).toBe(true);
        expect(indexing.shadowRoot?.querySelector("[data-candidate]")).toBeNull();
        expect(indexing.shadowRoot?.querySelector(".binding")).toBeNull();
        expect(variables.hidden).toBe(false);
        expect(variables.value).toContain("${site.name}");
        expect(indexing.querySelector<HTMLInputElement>('[name="indexingEnabled"]')?.value).toBe("true");

        toggle.checked = false;
        toggle.dispatchEvent(new Event("change"));
        expect(indexing.querySelector<HTMLInputElement>('[name="indexingEnabled"]')?.value).toBe("false");
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

function mockPageDetailFetch(
    options: { title?: string; description?: string; configured?: boolean; suggested?: boolean } = {},
): typeof fetch {
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
            title: options.title ?? "Pricing",
            description: options.description ?? "Pricing page",
            path: "/pricing",
            publicUrl: "https://site.test/pricing",
            tags: ["pricing", "landing"],
            published: true,
            indexingEditor: {
                configured: options.configured ?? false,
                suggested: options.suggested ?? true,
                detectionStatus: "detected",
                enabled: true,
                selection: "urn%3Acommerce|product-by-slug|product",
                selectionValid: true,
                availableVariables: ["page.path", "site.host", "site.language", "site.name"],
                candidates: [
                    {
                        value: "urn%3Acommerce|product-by-slug|product",
                        label: "Product",
                        variables: ["content.title", "content.price"],
                        suggestedTitle: "${content.title}",
                        suggestedDescription: "Buy ${content.title}",
                    },
                ],
            },
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
