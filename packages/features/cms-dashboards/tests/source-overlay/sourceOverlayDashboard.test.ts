import { describe, expect, test } from "bun:test";
import { applyDashboardSourceOverlays, validateDashboard, type Dashboard } from "@bernouy/cms-dashboards";
import { applySourceOverlays } from "@bernouy/cms-sources";
import { dashboard, source, sourceOverlay } from "./sourceOverlayDashboardFixtures";

describe("dashboard source overlay fields", () => {
    test("adds dashboard columns, detail fields, and action body bindings", () => {
        const enrichedDashboard = applyDashboardSourceOverlays(dashboard, [sourceOverlay]);
        const table = enrichedDashboard.views[0] as Extract<Dashboard["views"][number], { widget: "w-table" }>;
        const detail = enrichedDashboard.views[1] as Extract<Dashboard["views"][number], { widget: "w-detail" }>;

        expect(table.columns).toContainEqual({ id: "company", label: "Company", path: "metadata.company" });
        expect(detail.main[0]?.id).toBe("accountFields");
        expect(detail.main[0]?.fields).toContainEqual({
            id: "company",
            label: "Company",
            path: "metadata.company",
            type: "text",
        });
        expect(detail.actions?.[0]?.endpoint?.body).toMatchObject({
            displayName: "$field.displayName",
            "metadata.company": "$field.company",
        });

        const enrichedSource = applySourceOverlays(source, [sourceOverlay]);
        expect(validateDashboard(enrichedDashboard, { source: enrichedSource })).toEqual([]);
    });

    test("overrides an existing dashboard detail field", () => {
        const enrichedDashboard = applyDashboardSourceOverlays(dashboard, [
            {
                id: "account-lookup",
                sourceId: "user-account",
                fields: [],
                dashboardFields: [
                    {
                        dashboardId: "user-account-users",
                        viewId: "accountDetail",
                        fieldId: "displayName",
                        field: {
                            label: "Account",
                            type: "combobox",
                            lookup: {
                                endpoint: "listAccounts",
                                itemsPath: "accounts",
                                valuePath: "userId",
                                labelPath: "displayName",
                                selected: "$resource.account",
                            },
                        },
                    },
                ],
            },
        ]);
        const detail = enrichedDashboard.views[1] as Extract<Dashboard["views"][number], { widget: "w-detail" }>;

        expect(detail.main[0]?.fields[0]).toMatchObject({
            id: "displayName",
            label: "Account",
            type: "combobox",
            lookup: { endpoint: "listAccounts", selected: "$resource.account" },
        });
        expect(validateDashboard(enrichedDashboard, { source })).toEqual([]);
    });

    test("renders overlay fields with options as selects", () => {
        const overlayWithOptions = {
            ...sourceOverlay,
            fields: [
                {
                    id: "accountStatus",
                    label: "Account status",
                    type: "string" as const,
                    section: "accountFields",
                    options: [
                        { value: "pending", label: "Pending" },
                        { value: "active", label: "Active" },
                    ],
                },
            ],
        };
        const enrichedDashboard = applyDashboardSourceOverlays(dashboard, [overlayWithOptions]);
        const detail = enrichedDashboard.views[1] as Extract<Dashboard["views"][number], { widget: "w-detail" }>;

        expect(detail.main[0]?.fields).toContainEqual({
            id: "accountStatus",
            label: "Account status",
            path: "metadata.accountStatus",
            type: "select",
            options: [
                { value: "pending", label: "Pending" },
                { value: "active", label: "Active" },
            ],
        });

        const enrichedSource = applySourceOverlays(source, [overlayWithOptions]);
        expect(
            enrichedSource.endpoints.find((endpoint) => endpoint.urn.endsWith(":getAccountByUserId"))?.output?.[0]
                ?.body,
        ).toMatchObject({
            properties: { metadata: { properties: { accountStatus: { type: "string" } } } },
        });
        expect(validateDashboard(enrichedDashboard, { source: enrichedSource })).toEqual([]);
    });
});
