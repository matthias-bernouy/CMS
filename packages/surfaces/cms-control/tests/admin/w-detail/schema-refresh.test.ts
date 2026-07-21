import { afterEach, describe, expect, test } from "bun:test";
import {
    WIDGET_ACTION_EVENT,
    type WidgetActionDetail,
} from "../../../src/components/admin/Resources/Dashboards/widgets/shared";
import { waitForDetail } from "../dashboards/detailTestHelpers";

const realFetch = globalThis.fetch;

afterEach(() => {
    globalThis.fetch = realFetch;
    document.body.replaceChildren();
});

describe("dashboard dynamic schema refresh", () => {
    test("reloads only when a declared schema parameter dependency changes", async () => {
        const requests: Request[] = [];
        let resolveRefresh: ((response: Response) => void) | undefined;
        globalThis.fetch = (async (input, init) => {
            const request = new Request(input, init);
            requests.push(request);
            if (new URL(request.url).searchParams.get("categoryId") === "10") {
                return new Promise<Response>((resolve) => {
                    resolveRefresh = resolve;
                });
            }
            return Response.json({ fields: [{ id: "weight", label: "Weight", type: "number" }] });
        }) as typeof fetch;
        const detail = document.createElement("cms-dashboard-w-detail");
        const actions: WidgetActionDetail[] = [];
        detail.addEventListener(WIDGET_ACTION_EVENT, (event) => {
            actions.push((event as CustomEvent<WidgetActionDetail>).detail);
        });
        detail.setAttribute(
            "data-config-json",
            JSON.stringify({
                widget: "w-detail",
                id: "productDetail",
                source: { endpoint: "product" },
                actions: [{ id: "save", label: "Save", endpoint: { endpoint: "upsertProduct" } }],
                main: [
                    {
                        id: "main",
                        title: "Product",
                        fields: [
                            { id: "primaryCategoryId", label: "Category", path: "primaryCategoryId", type: "number" },
                            {
                                id: "metadata",
                                label: "Metadata",
                                path: "metadata",
                                type: "schema",
                                schema: {
                                    endpoint: "categoryProductFields",
                                    params: { categoryId: "$field.primaryCategoryId" },
                                    itemsPath: "fields",
                                },
                            },
                        ],
                    },
                ],
            }),
        );
        detail.setAttribute(
            "data-source-json",
            JSON.stringify({
                id: 42,
                primaryCategoryId: 9,
                metadata: { weight: 300 },
            }),
        );
        detail.setAttribute("data-row-key", "42");
        detail.setAttribute("data-source-id", "commerce");
        document.body.append(detail);
        await waitForDetail(() => Boolean(detail.shadowRoot?.querySelector("[data-schema-key='weight']")));
        expect(requests).toHaveLength(1);

        const dynamicField = detail.shadowRoot!.querySelector<HTMLElement>("[data-schema-key='weight']")!;
        dynamicField.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
        await new Promise((resolve) => setTimeout(resolve, 300));
        expect(requests).toHaveLength(1);

        const category = detail.shadowRoot!.querySelector<HTMLElement & { value: string }>(
            "[data-field-control='primaryCategoryId']",
        )!;
        category.value = "10";
        category.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
        const staleWeight = detail.shadowRoot!.querySelector<HTMLElement & { value: string }>(
            "[data-schema-key='weight']",
        )!;
        staleWeight.value = "999";
        staleWeight.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
        detail.shadowRoot!.querySelector<HTMLButtonElement>("[data-action='save']")!.click();
        expect((actions[0]?.fields as Record<string, unknown>).metadata).toEqual({ weight: 300 });
        await waitForDetail(() => requests.length === 2);

        expect(requests[1]?.url).toContain("categoryId=10");
        expect(detail.shadowRoot?.querySelector("[data-schema-key='weight']")).toBeNull();
        expect(detail.shadowRoot?.querySelector(".detail-schema-status-loading")).not.toBeNull();

        resolveRefresh!(Response.json({ fields: [{ id: "length", label: "Length", type: "number" }] }));
        await waitForDetail(() => Boolean(detail.shadowRoot?.querySelector("[data-schema-key='length']")));
    });
});
