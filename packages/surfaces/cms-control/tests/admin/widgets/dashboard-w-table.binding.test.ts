import { afterEach, describe, expect, test } from "bun:test";
import { Button } from "@bernouy/components";
import "../../../src/components/admin/Resources/Dashboards/widgets/w-table/WTable";
import {
    WIDGET_ACTION_EVENT,
    WIDGET_FILTER_CHANGE_EVENT,
    WIDGET_ROW_SELECT_EVENT,
    type WidgetActionDetail,
    type WidgetFilterChangeDetail,
    type WidgetRowSelectDetail,
} from "../../../src/components/admin/Resources/Dashboards/widgets/shared";

if (!customElements.get("p9r-button")) {
    customElements.define("p9r-button", Button);
}

afterEach(() => {
    document.body.replaceChildren();
});

describe("dashboard table widget binding", () => {
    test("keeps rows generated in the widget light DOM", async () => {
        const table = document.createElement("cms-dashboard-w-table");
        table.setAttribute(
            "data-config-json",
            JSON.stringify({
                widget: "w-table",
                id: "productsTable",
                source: { endpoint: "products", itemsPath: "items" },
                rowKey: "id",
                columns: [
                    { id: "title", label: "Product", path: "title", primary: true },
                    { id: "status", label: "Status", path: "status", format: "badge" },
                ],
                selection: { opens: "productDetail" },
            }),
        );

        const row = document.createElement("cms-dashboard-w-row");
        row.setAttribute("row-key", "1");
        row.setAttribute("collection", "productDetail");
        row.append(cell("title", "Racket Pro", "1", true), cell("status", "draft", "", false, "badge"));
        table.append(row);

        document.body.append(table);
        await Promise.resolve();

        expect(table.shadowRoot!.querySelector("tbody")).toBeNull();
        expect(table.shadowRoot!.querySelectorAll("[data-column-header]")).toHaveLength(2);
        expect(table.querySelectorAll("cms-dashboard-w-row")).toHaveLength(1);
        expect(table.querySelector("cms-dashboard-w-row")?.getAttribute("row-key")).toBe("1");
        expect(table.querySelector("cms-dashboard-w-cell[column='title']")?.textContent).toBe("Racket Pro");
        expect(table.querySelector("cms-dashboard-w-cell[column='status']")?.getAttribute("tone")).toBe("badge");
    });

    test("emits table action events with the source widget id", async () => {
        const table = document.createElement("cms-dashboard-w-table");
        table.setAttribute(
            "data-config-json",
            JSON.stringify({
                widget: "w-table",
                id: "subscriptionsTable",
                source: { endpoint: "listSubscriptions", itemsPath: "subscriptions" },
                rowKey: "email",
                columns: [{ id: "email", label: "Email", path: "email", primary: true }],
                actions: [
                    {
                        id: "exportSubscriptions",
                        label: "Export CSV",
                        endpoint: { endpoint: "exportSubscriptions" },
                        download: { filename: "newsletter-subscriptions.csv" },
                    },
                ],
            }),
        );

        const actions: WidgetActionDetail[] = [];
        table.addEventListener(WIDGET_ACTION_EVENT, (event) => {
            actions.push((event as CustomEvent<WidgetActionDetail>).detail);
        });

        document.body.append(table);
        await Promise.resolve();

        const button = table.shadowRoot!.querySelector("p9r-button") as HTMLElement;
        button.click();

        expect(button.shadowRoot?.querySelector("button")?.getAttribute("aria-label")).toBe("Export CSV");
        expect(button.getAttribute("color")).toBe("primary");
        expect(button.hasAttribute("tone")).toBeFalse();
        expect(actions).toEqual([{ action: "exportSubscriptions", widget: "subscriptionsTable", target: undefined }]);
    });

    test("renders declared filters and emits the submitted filter values", async () => {
        const table = document.createElement("cms-dashboard-w-table");
        table.setAttribute(
            "data-config-json",
            JSON.stringify({
                widget: "w-table",
                id: "productsTable",
                source: {
                    endpoint: "products",
                    params: { q: "$filter.q", status: "$filter.status" },
                    itemsPath: "items",
                },
                rowKey: "id",
                columns: [{ id: "title", label: "Product", path: "title", primary: true }],
                filters: [
                    { id: "q", label: "Search", type: "text", placeholder: "Search products" },
                    {
                        id: "status",
                        label: "Status",
                        type: "select",
                        options: [
                            { value: "draft", label: "Draft" },
                            { value: "published", label: "Published" },
                        ],
                    },
                ],
            }),
        );
        table.setAttribute("data-filters-json", JSON.stringify({ q: "racket", status: "published" }));
        const changes: WidgetFilterChangeDetail[] = [];
        table.addEventListener(WIDGET_FILTER_CHANGE_EVENT, (event) =>
            changes.push((event as CustomEvent<WidgetFilterChangeDetail>).detail),
        );

        document.body.append(table);
        await Promise.resolve();

        const form = table.shadowRoot!.querySelector<HTMLFormElement>("[data-filters]")!;
        const search = form.querySelector<HTMLInputElement>("[name='q']")!;
        const status = form.querySelector<HTMLSelectElement>("[name='status']")!;
        expect(form.hidden).toBeFalse();
        expect(Array.from(form.querySelectorAll("label")).map((label) => label.textContent)).toEqual([
            "Search",
            "StatusAllDraftPublished",
        ]);
        expect({ search: search.value, status: status.value }).toEqual({
            search: "racket",
            status: "published",
        });

        search.value = "pro";
        status.value = "draft";
        form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
        table.shadowRoot!.querySelector<HTMLButtonElement>("[data-filter-clear]")!.click();

        expect(changes).toEqual([
            { widget: "productsTable", filters: { q: "pro", status: "draft" } },
            { widget: "productsTable", filters: {} },
        ]);
    });

    test("does not select rows when the table has no detail target", async () => {
        const row = document.createElement("cms-dashboard-w-row");
        row.setAttribute("row-key", "user@example.com");

        const selections: WidgetRowSelectDetail[] = [];
        row.addEventListener(WIDGET_ROW_SELECT_EVENT, (event) => {
            selections.push((event as CustomEvent<WidgetRowSelectDetail>).detail);
        });

        document.body.append(row);
        await Promise.resolve();

        row.shadowRoot!.querySelector<HTMLElement>(".row")!.click();

        expect(selections).toEqual([]);
    });
});

function cell(id: string, title: string, meta = "", primary = false, tone = ""): HTMLElement {
    const element = document.createElement("cms-dashboard-w-cell");
    element.setAttribute("column", id);
    element.textContent = title;
    if (meta) {
        element.setAttribute("meta", meta);
    }
    if (primary) {
        element.toggleAttribute("primary", true);
    }
    if (tone) {
        element.setAttribute("tone", tone);
    }
    return element;
}
