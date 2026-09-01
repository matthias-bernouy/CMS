import type {
    DashboardEmbeddedLookupRef,
    DashboardField,
    DashboardSection,
    DashboardWidget,
} from "@bernouy/cms-dashboards";

type DetailWidget = Extract<DashboardWidget, { widget: "w-detail" }>;
type LookupField = Extract<DashboardField, { type: "combobox" | "tokens" }>;
type CmsUserField = Extract<DashboardField, { type: "cms-user" }>;

export type DetailLookupTarget = {
    key: string;
    lookup: DashboardEmbeddedLookupRef;
    selectedField?: LookupField;
};

export function nestedLookupKey(fieldId: string, nestedId: string): string {
    return `${fieldId}::${nestedId}`;
}

export function detailLookupTargets(widget: DetailWidget): DetailLookupTarget[] {
    return detailFields(widget).flatMap((field) => {
        if (isLookupField(field)) {
            return [{ key: field.id, lookup: field.lookup!, selectedField: field }];
        }
        if (field.type === "table") {
            return field.columns.flatMap((column) =>
                column.editable === true && column.type === "combobox" && column.lookup
                    ? [{ key: nestedLookupKey(field.id, column.id), lookup: column.lookup }]
                    : [],
            );
        }
        if (field.type === "reorderable-list") {
            return field.fields.flatMap((item) =>
                item.type === "combobox" && item.lookup
                    ? [{ key: nestedLookupKey(field.id, item.id), lookup: item.lookup }]
                    : [],
            );
        }
        return [];
    });
}

export function allLookupTargetKeys(widget: DetailWidget): Set<string> {
    return new Set([
        ...detailLookupTargets(widget).map((target) => target.key),
        ...detailFields(widget)
            .filter((field): field is CmsUserField => field.type === "cms-user")
            .map((field) => field.id),
    ]);
}

export function cmsUserTarget(widget: DetailWidget, key: string): CmsUserField | undefined {
    return detailFields(widget).find((field): field is CmsUserField => field.id === key && field.type === "cms-user");
}

export function lookupTargetKeysDependingOn(widget: DetailWidget, changedFieldId: string): Set<string> {
    if (!changedFieldId) {
        return new Set();
    }
    return new Set(
        detailLookupTargets(widget)
            .filter((target) =>
                Object.values(target.lookup.params ?? {}).some(
                    (expression) =>
                        expression === `$field.${changedFieldId}` || expression.startsWith(`$field.${changedFieldId}.`),
                ),
            )
            .map((target) => target.key),
    );
}

export function isLookupField(field: DashboardField): field is LookupField {
    return (field.type === "combobox" || field.type === "tokens") && Boolean(field.lookup);
}

function detailFields(widget: DetailWidget): DashboardField[] {
    return [...widget.main.filter(isDetailSection), ...(widget.aside ?? [])].flatMap((section) => section.fields);
}

function isDetailSection(item: DetailWidget["main"][number]): item is DashboardSection {
    return !("widget" in item);
}
