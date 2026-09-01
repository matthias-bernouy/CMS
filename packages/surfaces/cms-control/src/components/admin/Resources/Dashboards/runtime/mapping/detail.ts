import type { DashboardAction, DashboardField, DashboardSection, DashboardWidget } from "@bernouy/cms-dashboards";
import type { WDetailData, WDetailSection } from "../../widgets/w-detail/types";
import { matchesDashboardVisibility, textAt, valueAt } from "../expressions";
import { detailField } from "./fields";
import type { DetailOptions, DetailSchemas } from "./types";

type DetailWidget = Extract<DashboardWidget, { widget: "w-detail" }>;

export function detailData(
    widget: DetailWidget,
    resource: unknown,
    rowKey: string,
    draft: Record<string, unknown> = {},
    options: DetailOptions = {},
    sourceId = "",
    schemas: DetailSchemas = {},
): WDetailData {
    const fields = { ...fieldValues(widget, resource), ...draft };
    const scope = { ...record(resource), ...fields };
    return {
        rowKey,
        eyebrow: widget.id,
        title: textAt(scope, widget.title?.path, widget.title?.fallback ?? widget.id),
        status: widget.status ? textAt(scope, widget.status.path, widget.status.fallback) : undefined,
        actions: (widget.actions ?? [])
            .filter((action) => matchesDashboardVisibility(action.visibleWhen, { fields, resource }))
            .map(actionData),
        main: widget.main.map((item, index) =>
            "widget" in item
                ? { title: "", fields: [], widgetSlot: `main-widget-${index}` }
                : section(item, resource, fields, options, sourceId, schemas),
        ),
        aside: sections(widget.aside ?? [], resource, fields, options, sourceId, schemas),
    };
}

export function fieldValues(widget: DetailWidget, resource: unknown): Record<string, unknown> {
    const all = [...widget.main.filter(isDetailSection), ...(widget.aside ?? [])].flatMap((section) => section.fields);
    return Object.fromEntries(all.map((field) => [field.id, valueAt(resource, field.path)]));
}

function sections(
    sections: DashboardSection[],
    resource: unknown,
    fields: Record<string, unknown>,
    options: DetailOptions,
    sourceId: string,
    schemas: DetailSchemas,
): WDetailSection[] {
    return sections.map((item) => section(item, resource, fields, options, sourceId, schemas));
}

function section(
    section: DashboardSection,
    resource: unknown,
    fields: Record<string, unknown>,
    options: DetailOptions,
    sourceId: string,
    schemas: DetailSchemas,
): WDetailSection {
    return {
        title: section.title,
        ...(section.description ? { description: section.description } : {}),
        fields: section.fields
            .filter((field) => matchesDashboardVisibility(field.visibleWhen, { fields, resource }))
            .map((field) => detailField(field, resource, fields, options, sourceId, schemas)),
    };
}

function isDetailSection(item: DetailWidget["main"][number]): item is DashboardSection {
    return !("widget" in item);
}

function actionData(action: DashboardAction): WDetailData["actions"][number] {
    return {
        label: action.label,
        action: action.id,
        tone: action.tone,
        placement: action.placement,
        section: action.section,
        icon: isActionIcon(action.icon) ? action.icon : undefined,
        confirm: action.confirm,
    };
}

function isActionIcon(value: string | undefined): value is "archive" | "download" | "link" | "trash" {
    return value === "archive" || value === "download" || value === "link" || value === "trash";
}

function record(value: unknown): Record<string, unknown> {
    return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}
