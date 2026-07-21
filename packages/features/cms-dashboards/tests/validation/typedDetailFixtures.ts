import type { Dashboard, DashboardField } from "@bernouy/cms-dashboards";

export function detail(fields: DashboardField[]): Dashboard {
    return {
        id: "typed",
        source: "typed",
        views: [
            {
                widget: "w-detail",
                id: "detail",
                source: { endpoint: "resource" },
                main: [{ id: "main", title: "Main", fields }],
            },
        ],
    };
}

export const options = (count: number) =>
    Array.from({ length: count }, (_, index) => ({ value: `v${index}`, label: `V${index}` }));

export const columns = (count: number, offset = 0) =>
    Array.from({ length: count }, (_, index) => ({
        id: `column${index + offset}`,
        label: `Column ${index + offset}`,
        path: `column${index + offset}`,
    }));

export const nestedFields = (count: number, offset = 0) =>
    Array.from({ length: count }, (_, index) => ({
        id: `field${index + offset}`,
        label: `Field ${index + offset}`,
        path: `field${index + offset}`,
        type: "text" as const,
    }));

export const embeddedLookup = () => ({
    endpoint: "lookup",
    itemsPath: "items",
    valuePath: "id",
    labelPath: "name",
});
