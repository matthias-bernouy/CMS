import {
    sourceOverlayFieldPath,
    type SourceOverlay,
    type SourceOverlayDashboardField,
    type SourceOverlayField,
} from "@bernouy/cms-sources";
import type {
    DashboardAction,
    DashboardField,
    DashboardWidget,
} from "../../interfaces/Dashboard";
import {
    dashboardField,
    editableFields,
    joinedPath,
    normalizedTargetPath,
    overlayFieldId,
} from "./fieldHelpers";

type DetailWidget = Extract<DashboardWidget, { widget: "w-detail" }>;
type DetailSections = DetailWidget["main"];

export function applyDetailSourceOverlay(widget: DetailWidget, overlay: SourceOverlay, dashboardId: string): DetailWidget {
    const outputTargets = (overlay.output ?? []).filter(target => target.endpointId === widget.source.endpoint);
    const inputTargets = (overlay.input ?? []).filter(target => (widget.actions ?? []).some(action =>
        action.endpoint?.endpoint === target.endpointId));
    let next: DetailWidget = {
        ...widget,
        main: widget.main.map(section => ({ ...section, fields: [...section.fields] })),
        ...(widget.aside ? { aside: widget.aside.map(section => ({ ...section, fields: [...section.fields] })) } : {}),
    };
    next = {
        ...next,
        actions: addOverlayActionBodies(next.actions, overlay),
        main: addOverlayDetailTargets(next.main, overlay, outputTargets, inputTargets),
        ...(next.aside ? { aside: applyDashboardFieldOverrides(next.aside, overlay, dashboardId, widget.id) } : {}),
    };
    return { ...next, main: applyDashboardFieldOverrides(next.main, overlay, dashboardId, widget.id) };
}

function addOverlayDetailTargets(
    sections: DetailSections,
    overlay: SourceOverlay,
    outputTargets: NonNullable<SourceOverlay["output"]>,
    inputTargets: NonNullable<SourceOverlay["input"]>,
): DetailSections {
    let next = sections;
    for (const target of outputTargets) {
        const pathPrefix = normalizedTargetPath(target.path);
        const editable = inputTargets.some(input => normalizedTargetPath(input.path) === pathPrefix);
        next = addOverlayDetailFields(next, overlay, pathPrefix, !editable);
    }
    if (!outputTargets.length) {
        for (const target of inputTargets) {
            next = addOverlayDetailFields(next, overlay, normalizedTargetPath(target.path), false);
        }
    }
    return next;
}

function addOverlayDetailFields(
    sections: DetailSections,
    overlay: SourceOverlay,
    pathPrefix: string,
    readonly: boolean,
): DetailSections {
    const fields = readonly ? overlay.fields : overlay.fields.filter(field => field.adminEditable !== false);
    if (!fields.length) return sections;

    let next = sections;
    for (const section of groupedDashboardFields(overlay, fields, pathPrefix, readonly)) {
        const existing = next.find(candidate => candidate.id === section.id);
        if (!existing) {
            next = [...next, section];
            continue;
        }
        const seen = new Set(existing.fields.map(field => field.id));
        next = next.map(candidate => candidate.id === section.id
            ? { ...candidate, fields: [...candidate.fields, ...section.fields.filter(field => !seen.has(field.id))] }
            : candidate);
    }
    return next;
}

function groupedDashboardFields(
    overlay: SourceOverlay,
    fields: readonly SourceOverlayField[],
    pathPrefix: string,
    readonly: boolean,
): DetailSections {
    const sectionById = new Map((overlay.sections ?? []).map(section => [section.id, section]));
    const groups = new Map<string, DashboardField[]>();
    const fallbackSectionId = sectionById.keys().next().value ?? null;
    for (const field of fields) {
        const sectionId = field.section || fallbackSectionId;
        if (!sectionId) continue;
        if (!groups.has(sectionId)) groups.set(sectionId, []);
        groups.get(sectionId)!.push(dashboardField(field, { pathPrefix, readonly }));
    }

    return [...groups.entries()].map(([id, sectionFields]) => ({
        id,
        title: sectionById.get(id)?.label ?? overlay.label ?? "Additional information",
        fields: sectionFields,
    }));
}

function applyDashboardFieldOverrides(
    sections: DetailSections,
    overlay: SourceOverlay,
    dashboardId: string,
    viewId: string,
): DetailSections {
    const overrides = (overlay.dashboardFields ?? []).filter(field =>
        (!field.dashboardId || field.dashboardId === dashboardId)
        && field.viewId === viewId,
    );
    if (!overrides.length) return sections;
    return sections.map(section => ({
        ...section,
        fields: section.fields.map(field => dashboardFieldOverride(field, overrides) ?? field),
    }));
}

function dashboardFieldOverride(field: DashboardField, overrides: readonly SourceOverlayDashboardField[]): DashboardField | null {
    const override = overrides.find(candidate =>
        (candidate.fieldId && candidate.fieldId === field.id)
        || (candidate.path && candidate.path === field.path),
    );
    if (!override) return null;
    return { ...field, ...override.field } as DashboardField;
}

function addOverlayActionBodies(actions: DashboardAction[] | undefined, overlay: SourceOverlay): DashboardAction[] | undefined {
    if (!actions?.length) return actions;
    return actions.map(action => {
        if (!action.endpoint) return action;
        const target = (overlay.input ?? []).find(input => input.endpointId === action.endpoint!.endpoint);
        if (!target) return action;
        const fields = editableFields(overlay.fields, target.editable);
        if (!fields.length) return action;

        const body = { ...(action.endpoint.body ?? {}) };
        const pathPrefix = normalizedTargetPath(target.path);
        for (const field of fields) {
            body[joinedPath(pathPrefix, sourceOverlayFieldPath(field))] = `$field.${overlayFieldId(field, pathPrefix)}`;
        }
        return { ...action, endpoint: { ...action.endpoint, body } };
    });
}
