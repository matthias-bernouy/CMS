import { describe, expect, test } from "bun:test";
import { validateDashboard, type Dashboard } from "@bernouy/cms-dashboards";
import { productSource } from "./dashboardSourceFixture";
import { validDashboard } from "./validDashboardFixture";

const source = productSource;

describe("validateDashboard", () => {
    test("accepts a new widget-first dashboard against its source", () => {
        expect(validateDashboard(validDashboard(), { source })).toEqual([]);
    });

    test("validates bounded number fields", () => {
        const dashboard = validDashboard();
        const detail = dashboard.views[1] as Extract<Dashboard["views"][number], { widget: "w-detail" }>;
        detail.main[0]!.fields.push({
            id: "refundAmount",
            label: "Refund amount",
            path: "refundAmount",
            type: "number",
            min: 1,
            max: 10_000,
            step: 1,
        });

        expect(validateDashboard(dashboard, { source })).toEqual([]);
        const amount = detail.main[0]!.fields.at(-1)! as Extract<
            (typeof detail.main)[0]["fields"][number],
            { type: "number" }
        >;
        amount.step = 0;
        amount.max = 0;
        expect(validateDashboard(dashboard, { source })).toEqual(
            expect.arrayContaining([
                "views.1.main.0.fields.4.step must be greater than zero",
                "views.1.main.0.fields.4.max must be greater than or equal to min",
            ]),
        );
    });

    test("rejects legacy widgets", () => {
        const dashboard = validDashboard();
        dashboard.views.push({ widget: "w-create", id: "createProduct", collection: "products" } as never);

        expect(validateDashboard(dashboard, { source })).toContain("views.2.widget is not supported");
    });

    test("rejects duplicate widget ids", () => {
        const dashboard = validDashboard();
        dashboard.views[1]!.id = "productsTable";

        expect(validateDashboard(dashboard, { source })).toContain('duplicate widget id "productsTable"');
    });

    test("rejects source endpoint references that do not exist", () => {
        const dashboard = validDashboard();
        const table = dashboard.views[0] as Extract<Dashboard["views"][number], { widget: "w-table" }>;
        table.source.endpoint = "missing";

        expect(validateDashboard(dashboard, { source })).toContain(
            'views.0.source.endpoint references unknown endpoint "missing"',
        );
    });

    test("rejects params not declared by source endpoints", () => {
        const dashboard = validDashboard();
        const table = dashboard.views[0] as Extract<Dashboard["views"][number], { widget: "w-table" }>;
        table.source.params = { unknown: "$filter.search" };

        expect(validateDashboard(dashboard, { source })).toContain(
            'views.0.source.params.unknown is not declared by endpoint "urn:products:listProducts"',
        );
    });

    test("validates lookup modal creation fields", () => {
        const dashboard = validDashboard();
        const detail = dashboard.views[1] as Extract<Dashboard["views"][number], { widget: "w-detail" }>;
        const brand = detail.main[0]!.fields[2] as Extract<
            Dashboard["views"][number],
            { widget: "w-detail" }
        >["main"][number]["fields"][number] & {
            type: "combobox";
        };
        if (brand.lookup?.create?.mode === "modal") {
            brand.lookup.create.fields = [];
        }

        expect(validateDashboard(dashboard, { source })).toContain(
            "views.1.main.0.fields.2.lookup.create.fields must contain at least one field",
        );
    });

    test("validates action metadata and media endpoints", () => {
        const dashboard = validDashboard();
        const detail = dashboard.views[1] as Extract<Dashboard["views"][number], { widget: "w-detail" }>;
        detail.actions![1]!.section = "";
        const media = detail.main[1]!.fields[0] as Extract<
            Dashboard["views"][number],
            { widget: "w-detail" }
        >["main"][number]["fields"][number] & {
            type: "media";
        };
        media.actions!.upload!.endpoint = "missingUpload";

        expect(validateDashboard(dashboard, { source })).toEqual(
            expect.arrayContaining([
                "views.1.actions.1.section must be non-empty when provided",
                'views.1.main.1.fields.0.actions.upload.endpoint references unknown endpoint "missingUpload"',
            ]),
        );
    });

    test("validates download action filenames", () => {
        const dashboard = validDashboard();
        const table = dashboard.views[0] as Extract<Dashboard["views"][number], { widget: "w-table" }>;
        table.actions = [
            {
                id: "export",
                label: "Export",
                endpoint: { endpoint: "listProducts" },
                download: { filename: "../products.csv" },
            },
        ];

        expect(validateDashboard(dashboard, { source })).toContain(
            "views.0.actions.0.download.filename must be a safe file name",
        );
    });

    test("validates post-action detail targets", () => {
        const dashboard = validDashboard();
        const detail = dashboard.views[1] as Extract<Dashboard["views"][number], { widget: "w-detail" }>;
        detail.actions![0]!.after = { opens: "productDetail", row: "$result.id" };

        expect(validateDashboard(dashboard, { source })).toEqual([]);

        detail.actions![0]!.after = { opens: "missingDetail", row: "$result.id" };
        expect(validateDashboard(dashboard, { source })).toContain(
            'views.1.actions.0.after.opens references unknown widget "missingDetail"',
        );

        detail.actions![0]!.after = { opens: "productDetail", row: "$unknown.id" };
        expect(validateDashboard(dashboard, { source })).toContain(
            "views.1.actions.0.after.row has an invalid binding expression",
        );
    });

    test("rejects invalid binding expressions", () => {
        const dashboard = validDashboard();
        const detail = dashboard.views[1] as Extract<Dashboard["views"][number], { widget: "w-detail" }>;
        detail.actions![0]!.endpoint.body = { title: "$bad.title" };

        expect(validateDashboard(dashboard, { source })).toContain(
            "views.1.actions.0.endpoint.body.title has an invalid binding expression",
        );
    });
});
