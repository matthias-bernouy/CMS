import { afterEach, describe, expect, test } from "bun:test";
import { BindingCore, setBindingFilters } from "@bernouy/components/binding";
import "../../../../src/components/admin/Resources/Integrations/IntegrationBrowser";
import { collectAnswers, renderFields } from "cms-control/components/admin/Resources/Integrations/fields";
import type { IntegrationDefinition } from "@bernouy/cms-integrations";

const originalFetch = globalThis.fetch;
if (!customElements.get("cms-binding-core")) {
    customElements.define("cms-binding-core", BindingCore);
}
setBindingFilters({
    json: (value) => (value === undefined ? undefined : JSON.stringify(value)),
});

afterEach(() => {
    globalThis.fetch = originalFetch;
    document.head.innerHTML = "";
    document.body.replaceChildren();
    history.replaceState(null, "", "/");
});

describe("integration catalogue binding", () => {
    test("renders the catalogue as slotted p9r-grid items driven by the global binding runtime", () => {
        document.head.innerHTML = `<meta name="basePath" content="/cms">`;
        const admin = document.createElement("cms-integrations-admin");
        document.body.append(admin);

        expect(admin.shadowRoot).toBeNull();

        const source = admin.querySelector<HTMLElement>("[data-catalogue-source]")!;
        expect(source.getAttribute("cms-source")).toBe(
            "/cms/api/integrations/catalogue?q=#{integrationSearch}&category=#{integrationCategory} as catalogue",
        );
        expect(source.getAttribute("cms-reload-on")).toBe("integration:updated");

        const template = source.querySelector("template")!;
        const grid = template.content.querySelector("p9r-grid[data-catalogue]")!;
        expect(grid.getAttribute("min")).toBe("lg");
        expect(grid.getAttribute("max")).toBe("lg");
        expect(grid.getAttribute("gap")).toBe("sm");

        const card = template.content.querySelector("p9r-grid > a.catalogue-card")!;
        expect(card.getAttribute("cms-repeat")).toBe("catalogue.items as integration");
        expect(card.getAttribute("href")).toBe("{{ integration.setupUrl }}");
        expect(card.getAttribute("data-definition-kind")).toBe("{{ integration.kind }}");
        expect(template.content.querySelector("[cms-repeat='integration.badges as badge']")).not.toBeNull();
        expect(template.content.querySelector("[cms-param-sync='integrationSearch']")).not.toBeNull();
        expect(template.content.querySelector("[cms-param-sync='integrationCategory']")).not.toBeNull();
    });

    test("renders repeatable object fields with the CMS page lookup", async () => {
        document.head.innerHTML = `<meta name="basePath" content="/cms">`;
        const requests: string[] = [];
        globalThis.fetch = (async (input) => {
            requests.push(String(input));
            return Response.json([{ path: "/terms", title: "Terms" }]);
        }) as typeof fetch;
        const root = document.createElement("div");
        const template = document.createElement("template");
        template.innerHTML =
            '<label class="field"><span data-label></span><span data-control></span><small data-hint></small></label>';
        const definition: IntegrationDefinition = {
            kind: "legal",
            label: "Legal",
            inputs: [
                {
                    name: "documents",
                    label: "Documents",
                    type: "object-list",
                    addLabel: "Add document",
                    fields: [
                        { name: "page", label: "Page", type: "page-link", required: true },
                        {
                            name: "contexts",
                            label: "Contexts",
                            type: "select",
                            multiple: true,
                            options: [
                                { label: "Checkout", value: "checkout" },
                                { label: "Offer", value: "offer" },
                            ],
                        },
                    ],
                },
            ],
        };

        renderFields(root, template, definition, {
            documents: [{ page: "/terms", contexts: ["checkout", "offer"] }],
        });
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(requests).toEqual(["/cms/api/page/links?visible=published"]);
        expect(root.querySelector<HTMLSelectElement>('[data-object-field="page"]')?.value).toBe("/terms");
        expect(root.querySelector<HTMLSelectElement>('[data-object-field="contexts"]')?.multiple).toBeTrue();
        expect(collectAnswers(root, definition)).toEqual({
            documents: [{ page: "/terms", contexts: ["checkout", "offer"] }],
        });

        root.querySelector<HTMLButtonElement>(".object-list-add")!.click();
        expect(root.querySelectorAll("[data-object-list-item]")).toHaveLength(2);
        root.querySelector<HTMLButtonElement>(".object-list-remove")!.click();
        expect(root.querySelectorAll("[data-object-list-item]")).toHaveLength(1);
    });

    test("keeps installed integrations usable while a 503 repository error is explicit and retryable", async () => {
        document.head.innerHTML = `<meta name="basePath" content="/cms">`;
        let repositoryAvailable = false;
        const requests: string[] = [];
        globalThis.fetch = (async (input: RequestInfo | URL) => {
            const url = new URL(
                typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
                location.origin,
            );
            requests.push(url.pathname);
            if (url.pathname.endsWith("/api/integrations/installations")) {
                return Response.json([
                    {
                        id: "installed-payments",
                        label: "Installed payments",
                        definitionVersion: "1.0.0",
                        status: "success",
                        runCount: 1,
                        artifactCount: 0,
                        missingArtifactCount: 0,
                        updatedAt: "2026-07-26T10:00:00.000Z",
                    },
                ]);
            }
            if (!repositoryAvailable) {
                return new Response("Integration repository unavailable", { status: 503 });
            }
            if (url.pathname.endsWith("/api/integrations/list")) {
                return Response.json([{ kind: "available-integration", label: "Available integration", inputs: [] }]);
            }
            return Response.json({
                total: 1,
                count: 1,
                hasItems: true,
                categories: ["Commerce"],
                items: [
                    {
                        kind: "available-integration",
                        label: "Available integration",
                        description: "Available after retry.",
                        setupUrl: "/cms/admin/integrations?setup=available-integration",
                        iconHtml: "",
                        badges: [{ label: "Commerce", className: "badge" }],
                    },
                ],
            });
        }) as typeof fetch;

        const core = document.createElement("cms-binding-core");
        const admin = document.createElement("cms-integrations-admin");
        core.append(admin);
        document.body.append(core);

        await waitFor(() => admin.querySelector("[data-repository-error='definitions']") !== null);
        await waitFor(() => admin.querySelector("[data-integration-id='installed-payments']") !== null);

        const definitionsError = admin.querySelector<HTMLElement>("[data-repository-error='definitions']")!;
        expect(definitionsError.getAttribute("role")).toBe("alert");
        expect(definitionsError.textContent).toContain("Integration repository unavailable");
        expect(definitionsError.textContent).toContain("Installed integrations remain available");
        expect(definitionsError.textContent).toContain("HTTP 503");
        expect(admin.querySelector("[data-integration-id='installed-payments']")?.textContent).toContain(
            "Installed payments",
        );

        admin.querySelector<HTMLButtonElement>("[data-tab='catalogue']")!.click();
        await waitFor(() => admin.querySelector("[data-repository-error='catalogue']") !== null);
        const catalogueError = admin.querySelector<HTMLElement>("[data-repository-error='catalogue']")!;
        expect(catalogueError.getAttribute("role")).toBe("alert");
        expect(catalogueError.textContent).toContain("The integration catalogue could not be loaded");
        expect(admin.querySelector("[data-catalogue]")).toBeNull();

        repositoryAvailable = true;
        catalogueError.querySelector<HTMLButtonElement>("[data-repository-retry]")!.click();
        await waitFor(() => admin.querySelector("[data-repository-error]") === null);
        await waitFor(() => admin.querySelector("[data-definition-kind='available-integration']") !== null);

        expect(requests.filter((path) => path.endsWith("/api/integrations/list"))).toHaveLength(2);
        expect(requests.filter((path) => path.endsWith("/api/integrations/catalogue"))).toHaveLength(2);
        expect(admin.querySelector("[data-integration-id='installed-payments']")?.textContent).toContain(
            "Installed payments",
        );
    });
});

async function waitFor(predicate: () => boolean, timeout = 1_000): Promise<void> {
    const started = Date.now();
    while (!predicate()) {
        if (Date.now() - started > timeout) {
            throw new Error("Timed out waiting for the integration repository state");
        }
        await new Promise((resolve) => setTimeout(resolve, 5));
    }
}
