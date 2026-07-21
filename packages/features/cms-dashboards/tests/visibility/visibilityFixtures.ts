import type { Dashboard, DashboardVisibilityRule } from "@bernouy/cms-dashboards";

export function detailDashboard(visibleWhen: DashboardVisibilityRule): Dashboard {
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

export function wrapVisibilityRule(rule: DashboardVisibilityRule, count: number): DashboardVisibilityRule {
    let result = rule;
    for (let index = 0; index < count; index++) {
        result = { all: [result] };
    }
    return result;
}
