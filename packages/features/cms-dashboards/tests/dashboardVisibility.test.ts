import { describe, expect, test } from "bun:test";
import {
    DASHBOARD_VISIBILITY_MAX_DEPTH,
    DASHBOARD_VISIBILITY_MAX_NODES,
    evaluateDashboardVisibility,
    validateDashboard,
    type Dashboard,
    type DashboardAction,
    type DashboardVisibilityRule,
} from "@bernouy/cms-dashboards";

describe("dashboard visibility", () => {
    test("validates nested field and resource expressions on detail fields and actions", () => {
        const rule: DashboardVisibilityRule = {
            all: [
                { value: "$resource.status", equals: "draft" },
                {
                    any: [
                        { value: "$field.mode", equals: "advanced" },
                        { value: "$field.locale", notEquals: "fr" },
                    ],
                },
            ],
        };
        const dashboard = detailDashboard(rule);
        dashboard.views[0]!.actions![0]!.visibleWhen = rule;

        expect(validateDashboard(dashboard)).toEqual([]);
    });

    test("rejects unknown fields, malformed groups, and visibility on collection actions", () => {
        const dashboard = detailDashboard({ value: "$field.missing", notEquals: "blocked" });
        dashboard.views[0]!.actions![0]!.visibleWhen = { all: [] };
        dashboard.views[0]!.actions!.push({
            id: "invalid",
            label: "Invalid",
            endpoint: { endpoint: "save" },
            visibleWhen: false,
        } as unknown as DashboardAction);
        dashboard.views.push({
            widget: "w-table",
            id: "items",
            source: { endpoint: "items" },
            rowKey: "id",
            columns: [{ id: "id", label: "ID", path: "id" }],
            actions: [
                {
                    id: "refresh",
                    label: "Refresh",
                    endpoint: { endpoint: "refresh" },
                    visibleWhen: null as unknown as DashboardVisibilityRule,
                },
            ],
        });

        expect(validateDashboard(dashboard)).toEqual(
            expect.arrayContaining([
                "views.0.actions.0.visibleWhen.all must contain at least one rule",
                "views.0.actions.1.visibleWhen must be a visibility rule object",
                'views.0.main.0.fields.2.visibleWhen.value references unknown field "missing"',
                "views.1.actions.0.visibleWhen is only supported on detail actions",
            ]),
        );
    });

    test("bounds recursive depth and total rule count", () => {
        const tooDeep = wrap({ value: "$field.mode", equals: "advanced" }, DASHBOARD_VISIBILITY_MAX_DEPTH);
        const tooWide: DashboardVisibilityRule = {
            all: Array.from({ length: DASHBOARD_VISIBILITY_MAX_NODES }, () => ({
                value: "$field.mode",
                equals: "advanced",
            })),
        };

        expect(validateDashboard(detailDashboard(tooDeep))).toContainEqual(
            expect.stringContaining("maximum visibility depth"),
        );
        const countErrors = validateDashboard(detailDashboard(tooWide)).filter((error) =>
            error.includes("maximum visibility rule count"),
        );
        expect(countErrors).toHaveLength(1);
    });

    test("reports malformed detail section collections without throwing", () => {
        const dashboard = detailDashboard({ value: "$field.mode", equals: "advanced" });
        (dashboard.views[0] as unknown as { main: unknown }).main = {};

        expect(validateDashboard(dashboard)).toContain("views.0.main must contain at least one section");
    });

    test("evaluates expressions strictly and fails closed", () => {
        const values = { "$field.mode": "advanced", "$resource.status": "draft" };
        const resolve = (expression: string) => values[expression as keyof typeof values];
        expect(
            evaluateDashboardVisibility(
                {
                    all: [
                        { value: "$resource.status", equals: "draft" },
                        { value: "$field.mode", notEquals: "simple" },
                    ],
                },
                resolve,
            ),
        ).toBe(true);
        expect(evaluateDashboardVisibility({ value: "$field.missing", notEquals: "blocked" }, resolve)).toBe(false);
        expect(evaluateDashboardVisibility({ all: [] }, resolve)).toBe(false);
        expect(evaluateDashboardVisibility(null as unknown as DashboardVisibilityRule, resolve)).toBe(false);
        expect(evaluateDashboardVisibility(false as unknown as DashboardVisibilityRule, resolve)).toBe(false);
        expect(
            evaluateDashboardVisibility(
                { field: "mode", equals: "advanced" } as unknown as DashboardVisibilityRule,
                resolve,
            ),
        ).toBe(false);
        expect(
            evaluateDashboardVisibility(
                {
                    value: "$field.mode",
                    equals: "advanced",
                    notEquals: "simple",
                } as DashboardVisibilityRule,
                resolve,
            ),
        ).toBe(false);
        expect(
            evaluateDashboardVisibility(
                {
                    any: [
                        { value: "$field.mode", equals: "advanced" },
                        wrap({ value: "$field.mode", equals: "advanced" }, DASHBOARD_VISIBILITY_MAX_DEPTH),
                    ],
                },
                resolve,
            ),
        ).toBe(false);
        expect(
            evaluateDashboardVisibility(
                {
                    value: "$field.mode",
                    equals: "advanced",
                    unexpected: true,
                } as unknown as DashboardVisibilityRule,
                resolve,
            ),
        ).toBe(false);
    });
});

function detailDashboard(visibleWhen: DashboardVisibilityRule): Dashboard {
    return {
        id: "settings",
        source: "settings",
        views: [
            {
                widget: "w-detail",
                id: "settingsDetail",
                source: { endpoint: "setting" },
                actions: [{ id: "save", label: "Save", endpoint: { endpoint: "save" } }],
                main: [
                    {
                        id: "general",
                        title: "General",
                        fields: [
                            { id: "mode", label: "Mode", path: "mode", type: "text" },
                            { id: "locale", label: "Locale", path: "locale", type: "text" },
                            { id: "note", label: "Note", path: "note", type: "text", visibleWhen },
                        ],
                    },
                ],
            },
        ],
    };
}

function wrap(rule: DashboardVisibilityRule, count: number): DashboardVisibilityRule {
    let result = rule;
    for (let index = 0; index < count; index++) {
        result = { all: [result] };
    }
    return result;
}
