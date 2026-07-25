import { afterEach, describe, expect, test } from "bun:test";
import type { DashboardWidget } from "@bernouy/cms-dashboards";
import "cms-control/components";
import { formatDashboardValue } from "cms-control/components/admin/Resources/Dashboards/domain/formatting";
import { detailData } from "cms-control/components/admin/Resources/Dashboards/runtime/mapping/detail";
import { tableData } from "cms-control/components/admin/Resources/Dashboards/runtime/mapping/table";
import {
    appendSourceContent,
    tableRowsTemplate,
    urlSourceWrapper,
} from "cms-control/components/admin/Resources/Dashboards/runtime/mounting/mountSource";
import { createTableControl } from "cms-control/components/admin/Resources/Dashboards/widgets/w-detail/controls/table";

const realFetch = globalThis.fetch;

afterEach(() => {
    globalThis.fetch = realFetch;
    document.body.replaceChildren();
});

describe("dashboard presentation formats", () => {
    test("formats integer minor units with their currency and preserves unsupported values", () => {
        expect(formatDashboardValue(65_000, "money", { currency: "EUR", locale: "fr-FR" })).toBe(
            new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR" }).format(650),
        );
        expect(formatDashboardValue(65_000, "money", { currency: "JPY", locale: "fr-FR" })).toBe(
            new Intl.NumberFormat("fr-FR", { style: "currency", currency: "JPY" }).format(65_000),
        );
        expect(formatDashboardValue("sur devis", "money", { currency: "EUR", locale: "fr-FR" })).toBe("sur devis");
        expect(formatDashboardValue(null, "money", { currency: "EUR", locale: "fr-FR" })).toBe("");
    });

    test("formats timestamps and date-only values without exposing raw ISO strings", () => {
        const timestamp = "2026-07-25T13:15:00.000Z";
        const dateOnly = "2026-07-25";

        expect(formatDashboardValue(timestamp, "date", { locale: "fr-FR" })).toBe(
            new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium", timeStyle: "short" }).format(new Date(timestamp)),
        );
        expect(formatDashboardValue(dateOnly, "date", { locale: "fr-FR" })).toBe(
            new Intl.DateTimeFormat("fr-FR", { dateStyle: "medium" }).format(new Date(`${dateOnly}T00:00:00`)),
        );
        expect(formatDashboardValue("not-a-date", "date", { locale: "fr-FR" })).toBe("not-a-date");
    });

    test("declares reactive display values on source-backed table cells", () => {
        const row = tableRowsTemplate({
            widget: "w-table",
            id: "proposals",
            source: { endpoint: "manageProposals", itemsPath: "items" },
            rowKey: "id",
            columns: [
                { id: "amount", label: "Amount", path: "fixedTotalCents", format: "money" },
                { id: "updated", label: "Updated", path: "updatedAt", format: "date" },
            ],
        });
        const amount = row.querySelector<HTMLElement>("[column='amount']")!;
        const updated = row.querySelector<HTMLElement>("[column='updated']")!;

        expect(amount.dataset.displayFormat).toBe("money");
        expect(amount.dataset.displayValue).toBe("{{ row.fixedTotalCents }}");
        expect(amount.dataset.displayCurrency).toBe("{{ row.currency }}");
        expect(updated.dataset.displayFormat).toBe("date");
        expect(updated.dataset.displayValue).toBe("{{ row.updatedAt }}");
        expect(updated.dataset.displayCurrency).toBeUndefined();
    });

    test("applies the same formats to directly mapped table data", () => {
        const data = tableData(
            {
                widget: "w-table",
                id: "proposals",
                source: { endpoint: "manageProposals", itemsPath: "items" },
                rowKey: "id",
                columns: [
                    { id: "amount", label: "Amount", path: "fixedTotalCents", format: "money" },
                    { id: "updated", label: "Updated", path: "updatedAt", format: "date" },
                ],
            },
            [
                {
                    id: "proposal-1",
                    fixedTotalCents: 65_000,
                    currency: "EUR",
                    updatedAt: "2026-07-25T13:15:00.000Z",
                },
            ],
        );

        expect(data.rows[0]?.cells).toEqual({
            amount: formatDashboardValue(65_000, "money", { currency: "EUR" }),
            updated: formatDashboardValue("2026-07-25T13:15:00.000Z", "date"),
        });
    });

    test("renders formatted values inside table cells", () => {
        const cell = document.createElement("cms-dashboard-w-cell");
        cell.dataset.displayFormat = "money";
        cell.dataset.displayValue = "65000";
        cell.dataset.displayCurrency = "EUR";
        document.body.append(cell);

        expect(cell.shadowRoot?.querySelector("[data-formatted]")?.textContent).toBe(
            formatDashboardValue(65_000, "money", { currency: "EUR" }),
        );

        cell.dataset.displayFormat = "date";
        cell.dataset.displayValue = "2026-07-25T13:15:00.000Z";
        expect(cell.shadowRoot?.querySelector("[data-formatted]")?.textContent).toBe(
            formatDashboardValue("2026-07-25T13:15:00.000Z", "date"),
        );
        cell.remove();
    });

    test("formats values after source bindings interpolate a repeated row", async () => {
        globalThis.fetch = (async () =>
            Response.json({
                items: [
                    {
                        id: "proposal-1",
                        fixedTotalCents: 65_000,
                        currency: "EUR",
                        updatedAt: "2026-07-25T13:15:00.000Z",
                    },
                ],
            })) as unknown as typeof fetch;
        const widget = {
            widget: "w-table",
            id: "proposals",
            source: { endpoint: "manageProposals", itemsPath: "items" },
            rowKey: "id",
            columns: [
                { id: "amount", label: "Amount", path: "fixedTotalCents", format: "money" },
                { id: "updated", label: "Updated", path: "updatedAt", format: "date" },
            ],
        } satisfies Extract<DashboardWidget, { widget: "w-table" }>;
        const wrapper = urlSourceWrapper("/proposals", "dashboardData");
        const table = document.createElement("cms-dashboard-w-table");
        table.setAttribute("data-config-json", JSON.stringify(widget));
        table.append(tableRowsTemplate(widget));
        appendSourceContent(wrapper, table);
        const core = document.createElement("cms-binding-core");
        core.append(wrapper);
        document.body.append(core);

        await waitFor(
            () => document.querySelector("[column='amount']")?.getAttribute("data-display-value") === "65000",
        );

        const amount = document.querySelector<HTMLElement>("[column='amount']")!;
        const updated = document.querySelector<HTMLElement>("[column='updated']")!;
        expect(amount.shadowRoot?.querySelector("[data-formatted]")?.textContent).toBe(
            formatDashboardValue(65_000, "money", { currency: "EUR" }),
        );
        expect(updated.shadowRoot?.querySelector("[data-formatted]")?.textContent).toBe(
            formatDashboardValue("2026-07-25T13:15:00.000Z", "date"),
        );
    });

    test("formats readonly and nested-table values in detail widgets", () => {
        const widget = detailWidget();
        const resource = {
            id: "proposal-1",
            currentVersion: {
                currency: "EUR",
                fixedTotalCents: 65_000,
                publishedAt: "2026-07-25T13:15:00.000Z",
                items: [
                    {
                        label: "Restaurant booking",
                        unitAmountCents: 50_000,
                        currency: "EUR",
                        createdAt: "2026-07-24T10:00:00.000Z",
                    },
                ],
            },
        };
        const data = detailData(widget, resource, "proposal-1");
        const fields = data.main[0]!.fields;
        const total = fields.find((field) => field.id === "total")!;
        const published = fields.find((field) => field.id === "published")!;
        const lines = fields.find((field) => field.id === "lines")!;

        expect(total.value).toBe(formatDashboardValue(65_000, "money", { currency: "EUR" }));
        expect(published.value).toBe(formatDashboardValue(resource.currentVersion.publishedAt, "date"));
        expect(lines.columns?.map((column) => column.format)).toEqual(["text", "money", "date"]);

        const control = createTableControl(lines);
        const row = control.querySelector(".detail-table-row:not(.detail-table-head)")!;
        const values = Array.from(row.querySelectorAll("span")).map((cell) => cell.textContent);
        expect(values).toEqual([
            "Restaurant booking",
            formatDashboardValue(50_000, "money", { currency: "EUR" }),
            formatDashboardValue("2026-07-24T10:00:00.000Z", "date"),
        ]);
    });
});

function detailWidget(): Extract<DashboardWidget, { widget: "w-detail" }> {
    return {
        widget: "w-detail",
        id: "proposalDetail",
        source: { endpoint: "manageProposal" },
        main: [
            {
                id: "summary",
                title: "Summary",
                fields: [
                    {
                        id: "currency",
                        label: "Currency",
                        path: "currentVersion.currency",
                        type: "readonly",
                    },
                    {
                        id: "total",
                        label: "Fixed total",
                        path: "currentVersion.fixedTotalCents",
                        type: "readonly",
                        format: "money",
                    },
                    {
                        id: "published",
                        label: "Published",
                        path: "currentVersion.publishedAt",
                        type: "readonly",
                        format: "date",
                    },
                    {
                        id: "lines",
                        label: "Lines",
                        path: "currentVersion.items",
                        type: "table",
                        columns: [
                            { id: "label", label: "Line", path: "label", format: "text" },
                            { id: "amount", label: "Amount", path: "unitAmountCents", format: "money" },
                            { id: "created", label: "Created", path: "createdAt", format: "date" },
                        ],
                    },
                ],
            },
        ],
    };
}

async function waitFor(predicate: () => boolean): Promise<void> {
    for (let attempt = 0; attempt < 80; attempt += 1) {
        if (predicate()) {
            return;
        }
        await new Promise((resolve) => setTimeout(resolve, 5));
    }
    throw new Error("condition was not reached");
}
