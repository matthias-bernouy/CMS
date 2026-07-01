import { describe, expect, test } from "bun:test";
import getIntegrations from "cms-control/api/integrations/list.get";
import type { IntegrationDefinition, IntegrationDefinitionRepository } from "@bernouy/cms-integrations";
import { makeCms } from "./helpers";

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

        const body = await (await getIntegrations(
            new Request("http://localhost/cms/api/integrations/list"),
            cms,
        )).json();

        expect(body.filter((item: IntegrationDefinition) => item.kind === "test-secret-source")).toEqual([localDefinition]);
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
            get: async kind => {
                if (kind === "broken") throw new Error("broken definition");
                return kind === "valid" ? validDefinition : null;
            },
        };

        const body = await (await getIntegrations(
            new Request("http://localhost/cms/api/integrations/list"),
            { integrationCatalog } as any,
        )).json();

        expect(body).toEqual([validDefinition]);
    });
});
