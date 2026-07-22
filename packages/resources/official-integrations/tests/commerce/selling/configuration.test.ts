import { describe, expect, test } from "bun:test";
import { expectRpc, installCommerceTestEnvironment, jsonResponse, requestCommerce, setRestResponder } from "../harness";

installCommerceTestEnvironment();

describe("commerce workflow configuration requests", () => {
    test("returns enabled custom-field schemas for a requested entity", async () => {
        let customFieldsUrl = "";
        setRestResponder((request) => {
            if (new URL(request.url).pathname.endsWith("/custom_field_definitions")) {
                customFieldsUrl = request.url;
                return jsonResponse([
                    {
                        entity_type: "product",
                        key: "brand",
                        label: "Brand",
                        field_type: "string",
                        options: [],
                        required: false,
                        self_editable: false,
                        admin_editable: true,
                        public_readable: true,
                        show_in_dashboard_table: true,
                        enabled: true,
                    },
                ]);
            }
            return jsonResponse([]);
        });

        const response = await requestCommerce("/configuration/custom-fields?entityType=product");
        const body = await response.json();
        const query = new URL(customFieldsUrl).searchParams;

        expect(response.status).toBe(200);
        expect(query.get("entity_type")).toBe("eq.product");
        expect(query.get("enabled")).toBe("eq.true");
        expect(body.fields).toEqual([
            expect.objectContaining({
                id: "brand",
                path: "metadata.brand",
                section: "productCustomFields",
                exposeToEditorSources: true,
            }),
        ]);
    });

    test("rejects unsupported custom-field schema entities", async () => {
        const response = await requestCommerce("/configuration/custom-fields?entityType=unknown");

        expect(response.status).toBe(422);
        expect(await response.json()).toEqual({ error: "supported entityType is required" });
    });

    test("stores a numeric unit on the canonical metadata definition", async () => {
        setRestResponder(() =>
            jsonResponse({
                entity_type: "product",
                key: "weight",
                label: "Weight",
                field_type: "number",
                unit: "g",
            }),
        );

        const response = await requestCommerce("/admin/custom-field", {
            body: {
                entityType: "product",
                key: "weight",
                label: "Weight",
                fieldType: "number",
                unit: "g",
            },
        });

        expect(response.status).toBe(200);
        expect(expectRpc("upsert_custom_field").body.p_unit).toBe("g");
        expect(await response.json()).toMatchObject({ key: "weight", unit: "g" });
    });

    test("deletes an unused metadata definition through its trusted command", async () => {
        setRestResponder(() => jsonResponse({ entityType: "product", key: "weight", deleted: true }));

        const response = await requestCommerce("/admin/custom-field?entityType=product&key=weight", {
            method: "DELETE",
        });

        expect(response.status).toBe(200);
        expect(expectRpc("delete_custom_field").body).toEqual({
            p_entity_type: "product",
            p_key: "weight",
        });
        expect(await response.json()).toEqual({ entityType: "product", key: "weight", deleted: true });
    });

    test("returns editable defaults for new conditions, states, and transitions", async () => {
        const condition = await requestCommerce("/admin/offer-condition", { method: "GET" });
        const state = await requestCommerce("/admin/workflow-state", { method: "GET" });
        const transition = await requestCommerce("/admin/workflow-transition", { method: "GET" });

        expect(condition.status).toBe(200);
        expect(await condition.json()).toEqual({
            code: "",
            label: "",
            description: "",
            position: 0,
            enabled: true,
        });
        expect(state.status).toBe(200);
        expect(await state.json()).toEqual({
            code: "",
            label: "",
            phase: "admin_review",
            position: 0,
            enabled: true,
            terminal: false,
        });
        expect(transition.status).toBe(200);
        expect(await transition.json()).toEqual({
            fromState: "",
            action: "",
            actorKind: "admin",
            toState: "",
        });
    });

    test("gives workflow transition rows a stable composite id", async () => {
        setRestResponder(() =>
            jsonResponse([
                {
                    from_state: "pending_review",
                    action: "request_price",
                    actor_kind: "admin",
                    to_state: "awaiting_seller_price",
                },
            ]),
        );

        const response = await requestCommerce("/admin/workflow-transitions", { method: "GET" });

        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({
            items: [
                {
                    id: "pending_review:request_price:admin",
                    fromState: "pending_review",
                    action: "request_price",
                    actorKind: "admin",
                    toState: "awaiting_seller_price",
                },
            ],
            total: 1,
        });
    });
});
