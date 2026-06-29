import { describe, expect, test } from "bun:test";
import getIntegrations from "cms-control/api/integrations/list.get";
import type { IntegrationDefinition } from "@bernouy/cms-integrations";
import { makeCms } from "./helpers";

describe("GET /api/integrations/list", () => {
    test("lists built-in declarative integrations", async () => {
        const { cms } = makeCms();

        const res = await getIntegrations(new Request("http://localhost/cms/api/integrations/list"), cms);
        const body = await res.json();

        expect(res.status).toBe(200);
        expect(body.map((item: IntegrationDefinition) => item.kind).sort()).toEqual(["ban", "stripe"]);
    });

    test("lets site definitions shadow built-ins by kind", async () => {
        const localStripe: IntegrationDefinition = {
            kind: "stripe",
            label: "Local Stripe",
            inputs: [],
        };
        const { cms } = makeCms([localStripe]);

        const body = await (await getIntegrations(
            new Request("http://localhost/cms/api/integrations/list"),
            cms,
        )).json();

        expect(body.filter((item: IntegrationDefinition) => item.kind === "stripe")).toEqual([localStripe]);
    });
});
