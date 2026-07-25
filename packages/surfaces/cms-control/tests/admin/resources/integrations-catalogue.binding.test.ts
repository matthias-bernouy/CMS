import { afterEach, describe, expect, test } from "bun:test";
import "../../../src/components/admin/Resources/Integrations/IntegrationBrowser";
import { collectAnswers, renderFields } from "cms-control/components/admin/Resources/Integrations/fields";
import type { IntegrationDefinition } from "@bernouy/cms-integrations";

const originalFetch = globalThis.fetch;

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
});
