import { describe, expect, test } from "bun:test";
import {
    importIntegration,
    parseIntegrationDefinition,
} from "@bernouy/cms-integrations";
import { InMemoryFunctionRepository } from "@bernouy/cms-functions";
import { InMemoryRolesRepository, PUBLIC_ROLE, USER_ROLE } from "@bernouy/cms-permissions";
import { InMemorySecretStore } from "@bernouy/cms-secrets";
import { InMemorySourceRepository } from "@bernouy/cms-sources";

describe("@bernouy/cms-integrations access grants", () => {
    test("applies public and auth grants for imported endpoints and functions", async () => {
        const sources = new InMemorySourceRepository();
        const functions = new InMemoryFunctionRepository();
        const roles = new InMemoryRolesRepository();
        const secrets = new InMemorySecretStore();
        const definition = parseIntegrationDefinition({
            kind: "shop",
            label: "Shop",
            inputs: [],
            artifacts: [
                {
                    type: "source",
                    source: {
                        id: "shop",
                        meta: { name: "Shop" },
                        endpoints: [
                            endpoint("catalog", "public"),
                            endpoint("myOrders", { mode: "auth" }),
                            endpoint("adminOrders", "admin"),
                            endpoint("createOrder", "system"),
                        ],
                    },
                },
                {
                    type: "function",
                    function: {
                        id: "checkout",
                        method: "POST",
                        access: "public",
                        steps: [{ id: "catalog", call: { source: "shop", endpoint: "catalog" } }],
                        return: { body: { ok: true } },
                    },
                },
            ],
        });

        await importIntegration(
            { sources, functions, roles, secrets },
            { kind: "shop", answers: {}, options: {} },
            [definition],
        );
        await importIntegration(
            { sources, functions, roles, secrets },
            { kind: "shop", answers: {}, options: { force: true } },
            [definition],
        );

        expect((await roles.get(PUBLIC_ROLE))?.grants.map(grant => grant.permission).sort()).toEqual([
            "urn:shop:catalog",
            "urn:system-functions:checkout",
        ]);
        expect((await roles.get(USER_ROLE))?.grants.map(grant => grant.permission)).toEqual([
            "urn:shop:myOrders",
        ]);
    });
});

function endpoint(endpointId: string, access: string | { mode: string }) {
    return {
        endpointId,
        method: "GET",
        access,
        targetUrl: `https://example.com/${endpointId}`,
        params: [],
    };
}
