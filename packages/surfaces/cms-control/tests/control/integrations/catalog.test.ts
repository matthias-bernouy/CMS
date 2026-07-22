import { describe, expect, test } from "bun:test";
import getIntegrationCatalogue from "cms-control/api/_platform/integrations/catalogue.get";
import getIntegrations from "cms-control/api/_platform/integrations/list.get";
import postIntegrationImport from "cms-control/api/_platform/integrations/import.post";
import type { IntegrationDefinition, IntegrationDefinitionRepository } from "@bernouy/cms-integrations";
import { makeCms, postImport, TEST_SECRET_SOURCE_DEFINITION } from "./support/helpers";

describe("GET /api/integrations/list", () => {
    test("lists configured declarative integrations", async () => {
        const { cms } = makeCms();

        const res = await getIntegrations(new Request("http://localhost/cms/api/integrations/list"), cms);
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.map((item: IntegrationDefinition) => item.kind).sort()).toEqual(["test-secret-source"]);
    });

    test("uses provided site definitions directly", async () => {
        const localDefinition: IntegrationDefinition = {
            kind: "test-secret-source",
            label: "Local Test secret source",
            inputs: [],
        };
        const { cms } = makeCms([localDefinition]);

        const body = await (
            await getIntegrations(new Request("http://localhost/cms/api/integrations/list"), cms)
        ).json();

        expect(body.filter((item: IntegrationDefinition) => item.kind === "test-secret-source")).toEqual([
            localDefinition,
        ]);
    });

    test("keeps valid definitions when one catalog entry fails to load", async () => {
        const validDefinition: IntegrationDefinition = {
            kind: "valid",
            label: "Valid",
            inputs: [],
        };
        const integrationCatalog: IntegrationDefinitionRepository = {
            list: async () => [
                { kind: "broken", label: "Broken", versions: ["1.0.0"] },
                { kind: "valid", label: "Valid", versions: [] },
            ],
            getIndex: async () => null,
            listVersions: async () => [],
            get: async (kind) => {
                if (kind === "broken") {
                    throw new Error("broken definition");
                }
                return kind === "valid" ? validDefinition : null;
            },
        };

        const body = await (
            await getIntegrations(new Request("http://localhost/cms/api/integrations/list"), {
                integrationCatalog,
            } as any)
        ).json();

        expect(body).toEqual([validDefinition]);
    });
});

describe("GET /api/integrations/catalogue", () => {
    test("returns bindable catalogue items, categories, and base-path aware URLs", async () => {
        const products: IntegrationDefinition = {
            kind: "products",
            label: "Products",
            description: "Manage product catalogue entries.",
            category: "Commerce",
            version: "1.0.0",
            icon: { path: "assets/icon.svg" },
            inputs: [],
            artifacts: [{ type: "source", source: { id: "products", meta: { name: "Products" }, endpoints: [] } }],
        };
        const newsletter: IntegrationDefinition = {
            kind: "newsletter",
            label: "Newsletter",
            description: "Collect subscribers.",
            category: "Marketing",
            inputs: [],
            artifacts: [],
        };
        const { cms } = makeCms([products, newsletter]);

        const res = await getIntegrationCatalogue(
            new Request("http://localhost/cms/api/integrations/catalogue?q=product&category=Commerce"),
            cms,
        );
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.total).toBe(2);
        expect(body.count).toBe(1);
        expect(body.hasItems).toBe(true);
        expect(body.categories).toEqual(["Commerce", "Marketing"]);
        expect(body.items).toEqual([
            expect.objectContaining({
                kind: "products",
                label: "Products",
                category: "Commerce",
                setupUrl: "/cms/admin/integrations?setup=products",
                badges: [
                    { label: "Commerce", className: "badge" },
                    { label: "Source", className: "badge" },
                ],
            }),
        ]);
        expect(body.items[0].iconHtml).toContain('class="integration-icon"');
        expect(body.items[0].iconHtml).toContain("/cms/api/integrations/asset?kind=products");
    });

    test("excludes installed integrations from the catalogue", async () => {
        const spare: IntegrationDefinition = {
            kind: "spare",
            label: "Spare",
            category: "Other",
            inputs: [],
        };
        const { cms } = makeCms([TEST_SECRET_SOURCE_DEFINITION, spare]);

        await postIntegrationImport(
            postImport({
                kind: "test-secret-source",
                answers: { id: "installed-source", apiKey: "sk_test" },
            }),
            cms,
        );

        const body = await (
            await getIntegrationCatalogue(new Request("http://localhost/cms/api/integrations/catalogue"), cms)
        ).json();

        expect(body.total).toBe(1);
        expect(body.items.map((item: { kind: string }) => item.kind)).toEqual(["spare"]);
    });
});
