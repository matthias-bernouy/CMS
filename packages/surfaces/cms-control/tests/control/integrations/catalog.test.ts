import { describe, expect, test } from "bun:test";
import getIntegrations from "cms-control/api/integrations/list.get";
import type { IntegrationDefinition } from "@bernouy/cms-integrations";
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
});
