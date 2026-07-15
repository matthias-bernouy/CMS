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

describe("dashboard dynamic schema fields", () => {
    test("loads, excludes, and submits bounded schema fields without losing metadata", async () => {
        const requests: Request[] = [];
        globalThis.fetch = (async (input, init) => {
            requests.push(new Request(input, init));
            return Response.json({ fields: [
                { fieldKey: "weight", label: "Weight", fieldType: "number", required: true, unit: "g" },
                { fieldKey: "grip", definition: { label: "Grip", fieldType: "enum", options: ["L1", "L2"] } },
                { fieldKey: "optionalText", label: "Optional text", fieldType: "string" },
                { fieldKey: "optionalNumber", label: "Optional number", fieldType: "number" },
                { fieldKey: "optionalFlag", label: "Optional flag", fieldType: "boolean" },
                { fieldKey: "constructor", label: "Unsafe", fieldType: "string" },
            ] });
        }) as typeof fetch;
        const detail = detailElement();
        const actions: WidgetActionDetail[] = [];
        detail.addEventListener(WIDGET_ACTION_EVENT, event => {
            actions.push((event as CustomEvent<WidgetActionDetail>).detail);
        });
        document.body.append(detail);

        await waitForDetail(() => Boolean(detail.shadowRoot?.querySelector("[data-schema-key='weight']")));
        expect(requests).toHaveLength(1);
        expect(requests[0]?.url).toContain("categoryId=9");
        expect(detail.shadowRoot?.querySelector("[data-schema-key='grip']")).toBeNull();
        expect(detail.shadowRoot?.querySelector("[data-schema-key='constructor']")).toBeNull();
        expect(detail.shadowRoot?.querySelector(".detail-schema-unit")?.textContent).toBe("g");

        const weight = detail.shadowRoot!.querySelector("[data-schema-key='weight']") as HTMLElement & { value: string };
        weight.value = "320";
        weight.dispatchEvent(new Event("input", { bubbles: true, composed: true }));
        detail.shadowRoot!.querySelector<HTMLButtonElement>("[data-action='save']")!.click();

        expect(actions[0]?.fields).toMatchObject({
            metadata: { weight: 320, grip: "L1", legacy: "preserved" },
            variantAxes: [{ fieldKey: "grip" }],
        });
        expect((actions[0]?.fields as Record<string, unknown>).metadata).toEqual({
            weight: 320,
            grip: "L1",
            legacy: "preserved",
            optionalText: null,
        });

        detail.shadowRoot!.querySelector<HTMLButtonElement>(
            "[data-field-control='variantAxes'] [data-table-remove]",
        )!.click();
        await waitForDetail(() => Boolean(detail.shadowRoot?.querySelector("[data-schema-key='grip']")));
        expect((detail.shadowRoot!.querySelector("[data-schema-key='grip']") as HTMLElement & { value: string }).value)
            .toBe("L1");
    });

    test("distinguishes schema failures and preserves the existing object", async () => {
        globalThis.fetch = (async () => new Response("unavailable", { status: 503 })) as unknown as typeof fetch;
        const detail = detailElement();
        const actions: WidgetActionDetail[] = [];
        detail.addEventListener(WIDGET_ACTION_EVENT, event => {
            actions.push((event as CustomEvent<WidgetActionDetail>).detail);
        });
        document.body.append(detail);

        await waitForDetail(() => Boolean(detail.shadowRoot?.querySelector(".detail-schema-status-error")));
        expect(detail.shadowRoot?.textContent).toContain("Existing values are preserved");
        detail.shadowRoot!.querySelector<HTMLButtonElement>("[data-action='save']")!.click();

        expect(actions[0]?.fields).toMatchObject({
            metadata: { weight: 300, grip: "L1", legacy: "preserved" },
        });
    });

    test("distinguishes an empty schema from a loading or failed schema", async () => {
        globalThis.fetch = (async () => Response.json({ fields: [] })) as unknown as typeof fetch;
        const detail = detailElement();
        document.body.append(detail);

        await waitForDetail(() => Boolean(detail.shadowRoot?.querySelector(".detail-schema-status-empty")));
        expect(detail.shadowRoot?.textContent).toContain("No dynamic fields are configured");
        expect(detail.shadowRoot?.querySelector(".detail-schema-status-error")).toBeNull();
    });

    test("does not render schema definitions from an obsolete resource", async () => {
        const responses = new Map<string, (response: Response) => void>();
        globalThis.fetch = (async (input: RequestInfo | URL) => {
            const categoryId = new URL(String(input)).searchParams.get("categoryId") ?? "";
            return new Promise<Response>(resolve => responses.set(categoryId, resolve));
        }) as unknown as typeof fetch;
        const detail = detailElement();
        document.body.append(detail);
        await waitForDetail(() => responses.has("9"));

        detail.setAttribute("data-source-json", JSON.stringify({
            id: 43,
            primaryCategoryId: 10,
            metadata: {},
            variantAxes: [],
        }));
        await waitForDetail(() => responses.has("10"));
        responses.get("10")!(Response.json({
            fields: [{ id: "current", label: "Current", type: "string" }],
        }));
        await waitForDetail(() => Boolean(detail.shadowRoot?.querySelector("[data-schema-key='current']")));

        responses.get("9")!(Response.json({
            fields: [{ id: "obsolete", label: "Obsolete", type: "string" }],
        }));
        await new Promise(resolve => setTimeout(resolve, 20));
        expect(detail.shadowRoot?.querySelector("[data-schema-key='obsolete']")).toBeNull();
    });
});

function detailElement(): HTMLElement {
    const detail = document.createElement("cms-dashboard-w-detail");
    detail.setAttribute("data-config-json", JSON.stringify({
        widget: "w-detail",
        id: "productDetail",
        source: { endpoint: "product" },
        actions: [{ id: "save", label: "Save", endpoint: { endpoint: "upsertProduct" } }],
        main: [{
            id: "metadata",
            title: "Category metadata",
            fields: [{
                id: "metadata",
                label: "Metadata",
                path: "metadata",
                type: "schema",
                schema: {
                    endpoint: "categoryProductFields",
                    params: { categoryId: "$field.primaryCategoryId" },
                    itemsPath: "fields",
                },
                exclude: { from: "$field.variantAxes", valuePath: "fieldKey" },
            }],
        }],
        aside: [{
            id: "classification",
            title: "Classification",
            fields: [
                { id: "primaryCategoryId", label: "Primary category", path: "primaryCategoryId", type: "number" },
                { id: "variantAxes", label: "Variant axes", path: "variantAxes", type: "table", editable: true,
                    columns: [{ id: "fieldKey", label: "Field", path: "fieldKey", editable: true, type: "text" }] },
            ],
        }],
    }));
    detail.setAttribute("data-source-json", JSON.stringify({
        id: 42,
        primaryCategoryId: 9,
        metadata: { weight: 300, grip: "L1", legacy: "preserved", optionalText: null },
        variantAxes: [{ fieldKey: "grip" }],
    }));
    detail.setAttribute("data-row-key", "42");
    detail.setAttribute("data-source-id", "commerce");
    return detail;
}
