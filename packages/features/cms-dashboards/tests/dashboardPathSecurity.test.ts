import { describe, expect, test } from "bun:test";
import {
    isDashboardVisibilityExpression,
    isSafeDashboardExpression,
    isSafeDashboardPath,
    validateDashboard,
    type Dashboard,
} from "@bernouy/cms-dashboards";

describe("dashboard data path security", () => {
    test("accepts ordinary dotted paths and rejects prototype segments", () => {
        expect(isSafeDashboardPath("profile.company.name")).toBe(true);
        expect(isSafeDashboardPath("profile.__proto__.polluted")).toBe(false);
        expect(isSafeDashboardPath("constructor.prototype.polluted")).toBe(false);
        expect(isSafeDashboardPath("profile..name")).toBe(false);
        expect(isSafeDashboardExpression("$field.profile.name", ["field"])).toBe(true);
        expect(isSafeDashboardExpression("$field.__proto__.polluted", ["field"])).toBe(false);
        expect(isDashboardVisibilityExpression("$resource.constructor.name")).toBe(false);
    });

    test("rejects unsafe field and action body paths", () => {
        const dashboard: Dashboard = {
            id: "users",
            source: "users",
            views: [{
                widget: "w-detail",
                id: "userDetail",
                source: { endpoint: "user" },
                actions: [{
                    id: "save",
                    label: "Save",
                    endpoint: {
                        endpoint: "saveUser",
                        body: {
                            name: "$field.__proto__.polluted",
                            "__proto__.polluted": "$field.name",
                        },
                    },
                    after: {
                        opens: "userDetail",
                        row: "$result.constructor.prototype",
                    },
                }],
                main: [{
                    id: "general",
                    title: "General",
                    fields: [{
                        id: "name",
                        label: "Name",
                        path: "profile.__proto__.polluted",
                        type: "text",
                    }, {
                        id: "links",
                        label: "Links",
                        path: "links",
                        type: "reorderable-list",
                        itemKey: "__proto__.id",
                        positionPath: "constructor.position",
                        fields: [{
                            id: "label",
                            label: "Label",
                            path: "prototype.label",
                        }],
                    }],
                }],
            }],
        };

        expect(validateDashboard(dashboard)).toEqual(expect.arrayContaining([
            "views.0.actions.0.endpoint.body.__proto__.polluted must be a safe dotted data path",
            "views.0.actions.0.endpoint.body.name has an invalid binding expression",
            "views.0.actions.0.after.row has an invalid binding expression",
            "views.0.main.0.fields.0.path must be a safe dotted data path",
            "views.0.main.0.fields.1.itemKey must be a safe dotted data path",
            "views.0.main.0.fields.1.positionPath must be a safe dotted data path",
            "views.0.main.0.fields.1.fields.0.path must be a safe dotted data path",
        ]));
    });
});
