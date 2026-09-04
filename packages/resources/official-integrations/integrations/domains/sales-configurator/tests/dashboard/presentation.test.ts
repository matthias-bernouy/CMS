import { describe, expect, test } from "bun:test";
import type { DashboardWidget } from "@bernouy/cms-dashboards";
import { loadDefinitionFragment } from "../../../../../tests/helpers/definitionFragment";

const integrationRoot = new URL("../..", import.meta.url).pathname;

describe("sales-configurator dashboard presentation", () => {
    test("keeps money/date formats and readable table widths in assembled dashboards", async () => {
        const dashboards = await Promise.all(
            ["catalog", "proposals", "partners"].map(async (kind) => {
                const artifact = (await loadDefinitionFragment(
                    `${integrationRoot}/definitions/artifacts/dashboards/${kind}/definition.json`,
                )) as { dashboard: { id: string; views: DashboardWidget[] } };
                return artifact.dashboard;
            }),
        );
        const catalog = dashboards.find((dashboard) => dashboard.id === "{{answers.id}}-catalog")!;
        const proposals = dashboards.find((dashboard) => dashboard.id === "{{answers.id}}-proposals")!;
        const partners = dashboards.find((dashboard) => dashboard.id === "{{answers.id}}-partners")!;

        const variants = table(catalog.views, "variantsTable");
        expect(column(variants, "unitAmountCents")).toMatchObject({ format: "money", width: "10rem" });
        expect(column(variants, "name").width).toContain("15rem");

        const modules = table(catalog.views, "modulesTable");
        expect(column(modules, "updatedAt")).toMatchObject({ format: "date", width: "12rem" });
        expect(column(modules, "name").width).toContain("16rem");

        const variantFeatures = table(catalog.views, "variantFeaturesTable");
        expect(column(variantFeatures, "unitAmountCents")).toMatchObject({
            format: "money",
            label: "Amount (EUR)",
            width: "10rem",
        });

        const proposalTable = table(proposals.views, "proposalsTable");
        expect(column(proposalTable, "fixedTotalCents")).toMatchObject({ format: "money", width: "10rem" });
        expect(column(proposalTable, "updatedAt")).toMatchObject({ format: "date", width: "12rem" });
        expect(column(proposalTable, "client").width).toContain("14rem");

        const proposalDetail = detail(proposals.views, "proposalDetail");
        const detailFields = [...proposalDetail.main, ...(proposalDetail.aside ?? [])].flatMap(
            (section) => section.fields,
        );
        expect(detailFields.find((field) => field.id === "fixedTotalCents")).toMatchObject({
            type: "readonly",
            format: "money",
        });
        expect(detailFields.find((field) => field.id === "publishedAt")).toMatchObject({
            type: "readonly",
            format: "date",
        });
        expect(detailFields.find((field) => field.id === "clientRegistrationNumber")).toMatchObject({
            path: "client.companyRegistrationNumber",
            type: "readonly",
        });
        expect(detailFields.find((field) => field.id === "clientContactJobTitle")).toMatchObject({
            path: "client.contactJobTitle",
            type: "readonly",
        });
        expect(detailFields.find((field) => field.id === "clientCity")).toMatchObject({
            path: "client.city",
            type: "readonly",
        });
        expect(detailFields.find((field) => field.id === "clientNotes")).toMatchObject({
            path: "client.notes",
            type: "readonly",
        });
        const snapshot = detailFields.find((field) => field.id === "snapshotItems");
        expect(snapshot?.type).toBe("table");
        if (snapshot?.type === "table") {
            expect(snapshot.columns.find((entry) => entry.id === "label")?.width).toContain("16rem");
            expect(snapshot.columns.find((entry) => entry.id === "unitAmountCents")).toMatchObject({
                format: "money",
                width: "10rem",
            });
        }

        const partnerTable = table(partners.views, "partnersTable");
        expect(column(partnerTable, "contactEmail").width).toContain("16rem");
        expect(column(partnerTable, "updatedAt")).toMatchObject({ format: "date", width: "12rem" });

        const partnerDetail = detail(partners.views, "partnerDetail");
        const partnerFields = [...partnerDetail.main, ...(partnerDetail.aside ?? [])].flatMap(
            (section) => section.fields,
        );
        expect(partnerFields.find((field) => field.id === "cmsUserId")).toMatchObject({
            type: "cms-user",
            path: "cmsUserId",
            required: true,
            visibleWhen: { value: "$resource.id", equals: null },
        });
        expect(partnerFields.find((field) => field.id === "linkedCmsUserId")).toMatchObject({
            type: "readonly",
            path: "cmsUserId",
            visibleWhen: { value: "$resource.id", notEquals: null },
        });
        const createPartner = partnerDetail.actions?.find((action) => action.id === "createPartner");
        const savePartner = partnerDetail.actions?.find((action) => action.id === "savePartner");
        expect(createPartner?.endpoint?.body?.cmsUserId).toBe("$field.cmsUserId");
        expect(savePartner?.endpoint?.body?.cmsUserId).toBe("$resource.cmsUserId");
    });
});

type TableWidget = Extract<DashboardWidget, { widget: "w-table" }>;
type DetailWidget = Extract<DashboardWidget, { widget: "w-detail" }>;

function table(widgets: DashboardWidget[], id: string): TableWidget {
    const result = flatten(widgets).find(
        (widget): widget is TableWidget => widget.widget === "w-table" && widget.id === id,
    );
    if (!result) {
        throw new Error(`${id} table not found`);
    }
    return result;
}

function detail(widgets: DashboardWidget[], id: string): DetailWidget {
    const result = flatten(widgets).find(
        (widget): widget is DetailWidget => widget.widget === "w-detail" && widget.id === id,
    );
    if (!result) {
        throw new Error(`${id} detail not found`);
    }
    return result;
}

function column(widget: TableWidget, id: string): TableWidget["columns"][number] {
    const result = widget.columns.find((entry) => entry.id === id);
    if (!result) {
        throw new Error(`${id} column not found`);
    }
    return result;
}

function flatten(widgets: DashboardWidget[]): DashboardWidget[] {
    return widgets.flatMap((widget) => {
        if (widget.widget === "w-section") {
            return [widget, ...flatten(widget.children)];
        }
        if (widget.widget === "w-tabs") {
            return [widget, ...flatten(widget.tabs.flatMap((tab) => tab.children))];
        }
        return [widget];
    });
}
