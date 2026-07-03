import { afterEach, describe, expect, test } from "bun:test";
import "../../src/components/admin/Resources/Dashboards/widgets/w-table/WTable";

afterEach(() => {
    document.body.replaceChildren();
});

describe("dashboard table widget binding", () => {
    test("renders rows generated in the widget light DOM", async () => {
        const table = document.createElement("cms-dashboard-w-table");
        table.setAttribute("data-config-json", JSON.stringify({
            widget: "w-table",
            id: "productsTable",
            source: { endpoint: "products", itemsPath: "items" },
            rowKey: "id",
            columns: [
                { id: "title", label: "Product", path: "title", primary: true },
                { id: "status", label: "Status", path: "status", format: "badge" },
            ],
            selection: { opens: "productDetail" },
        }));

        const row = document.createElement("span");
        row.setAttribute("data-table-row", "");
        row.setAttribute("data-row-id", "1");
        row.setAttribute("data-collection", "productDetail");
        row.append(cell("title", "Racket Pro", "1", true), cell("status", "draft", "", false, "badge"));
        table.append(row);

        document.body.append(table);
        await Promise.resolve();

        const renderedRows = table.shadowRoot!.querySelectorAll<HTMLTableRowElement>("tbody tr");
        expect(renderedRows).toHaveLength(1);
        expect(renderedRows[0]?.dataset.rowKey).toBe("1");
        expect(renderedRows[0]?.textContent).toContain("Racket Pro");
        expect(renderedRows[0]?.textContent).toContain("draft");
    });
});

function cell(id: string, title: string, meta = "", primary = false, tone = ""): HTMLElement {
    const element = document.createElement("span");
    element.setAttribute("data-table-cell", id);
    element.setAttribute("data-title", title);
    if (meta) element.setAttribute("data-meta", meta);
    if (primary) element.setAttribute("data-primary", "true");
    if (tone) element.setAttribute("data-tone", tone);
    return element;
}
