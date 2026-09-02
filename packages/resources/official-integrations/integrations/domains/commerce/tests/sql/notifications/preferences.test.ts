import { beforeEach, describe, expect, test } from "bun:test";
import { projectStrictDataShape, type DataShape } from "@bernouy/cms-sources";
import {
    capturedFetches,
    installCommerceTestEnvironment,
    jsonResponse,
    requestCommerce,
    setRestResponder,
} from "../../harness";
import { loadIntegrationDefinition } from "../../../../../../tests/helpers/integrationDefinition";

type Definition = {
    artifacts: Array<{
        type: string;
        source?: {
            endpoints: Array<{
                endpointId: string;
                output?: Array<{ body?: DataShape }>;
            }>;
        };
    }>;
};

installCommerceTestEnvironment();

let transitEnabled = false;
const writes: unknown[] = [];

describe("native Commerce notifications", () => {
    beforeEach(() => {
        transitEnabled = false;
        writes.length = 0;
        setRestResponder(notificationRest);
    });

    test("locks required preferences and persists the current CMS user's optional choices", async () => {
        const getResponse = await requestCommerce("/notifications/preferences", { userId: "buyer-1" });
        expect(getResponse.status).toBe(200);
        expect(await getResponse.json()).toEqual({
            items: [
                expect.objectContaining({ key: "commerce.order.paid", configurable: false, enabled: true }),
                expect.objectContaining({
                    key: "commerce.order.fulfillment.in_transit",
                    configurable: true,
                    enabled: false,
                }),
            ],
        });

        const requiredResponse = await requestCommerce("/notifications/preferences", {
            userId: "buyer-1",
            body: { preferences: [{ key: "commerce.order.paid", enabled: false }] },
        });
        expect(requiredResponse.status).toBe(400);

        const optionalResponse = await requestCommerce("/notifications/preferences", {
            userId: "buyer-1",
            body: { preferences: [{ key: "commerce.order.fulfillment.in_transit", enabled: true }] },
        });
        expect(optionalResponse.status).toBe(200);
        expect(writes).toEqual([
            [
                expect.objectContaining({
                    cms_user_id: "buyer-1",
                    rule_key: "commerce.order.fulfillment.in_transit",
                    enabled: true,
                }),
            ],
        ]);
        expect(capturedFetches().every((call) => call.headers.get("accept-profile") === "commerce")).toBeTrue();
    });

    test("exposes built-in templates and lets administrators replace or disable delivery", async () => {
        const templates = await requestCommerce("/notifications/templates");
        expect(templates.status).toBe(200);
        const templatePayload = (await templates.json()) as {
            contractVersion: number;
            items: Array<Record<string, unknown>>;
        };
        expect(templatePayload.contractVersion).toBe(1);
        expect(templatePayload.items).toHaveLength(12);
        expect(templatePayload.items[0]).toMatchObject({
            key: "commerce.price_agreement.accepted",
            metadata: { owner: "commerce", contractVersion: 1 },
        });
        const definition = await loadIntegrationDefinition<Definition>(
            new URL("../../../definition.json", import.meta.url),
        );
        const source = definition.artifacts.find((artifact) => artifact.type === "source")?.source;
        const shape = source?.endpoints.find((endpoint) => endpoint.endpointId === "listDefaultNotificationTemplates")
            ?.output?.[0]?.body;
        if (!shape) {
            throw new Error("Commerce notification template output shape is missing");
        }
        expect(projectStrictDataShape(templatePayload, shape, "response")).toEqual(templatePayload);

        const updated = await requestCommerce("/notifications/admin/configuration", {
            userRole: "admin",
            body: { mode: "external" },
        });
        expect(updated.status).toBe(200);
        expect(await updated.json()).toMatchObject({ mode: "external" });
        expect(writes).toContainEqual(expect.objectContaining({ mode: "external" }));
    });
});

async function notificationRest(request: Request): Promise<Response> {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/notification_rules")) {
        return jsonResponse([
            {
                key: "commerce.order.paid",
                label: "Purchase confirmation",
                description: "Required",
                policy: "required",
            },
            {
                key: "commerce.order.fulfillment.in_transit",
                label: "Parcel in transit",
                description: "Optional",
                policy: "default_on",
            },
        ]);
    }
    if (url.pathname.endsWith("/notification_user_preferences") && request.method === "GET") {
        return jsonResponse([{ rule_key: "commerce.order.fulfillment.in_transit", enabled: transitEnabled }]);
    }
    if (url.pathname.endsWith("/notification_user_preferences") && request.method === "POST") {
        writes.push(await request.json());
        transitEnabled = true;
        return jsonResponse([]);
    }
    if (url.pathname.endsWith("/notification_configuration") && request.method === "PATCH") {
        writes.push(await request.json());
        return jsonResponse([]);
    }
    if (url.pathname.endsWith("/notification_configuration")) {
        return jsonResponse([{ mode: "external", updated_at: "2026-07-23T10:00:00.000Z" }]);
    }
    return jsonResponse({ message: "unexpected REST request" }, 500);
}
