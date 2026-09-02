import type {
    DashboardDefinition,
    DashboardViewDefinition,
    DashboardViewMount,
    DashboardViewNode,
    LegacyDashboardDefinition,
} from "../../../interfaces/Dashboard";
import { DASHBOARD_MAX_VIEW_DEPTH, DASHBOARD_SCHEMA_VERSION } from "../../../interfaces/Dashboard";
import { validateRequiredId } from "./basic";
import { collectWidgetIds, validateWidget } from "../widgets";

export function normalizeLegacyDashboardView(
    legacy: LegacyDashboardDefinition,
    origin?: DashboardViewDefinition["origin"],
): DashboardViewDefinition {
    const label = legacy.meta?.name ?? legacy.id;
    return {
        schemaVersion: DASHBOARD_SCHEMA_VERSION,
        id: legacy.id,
        source: legacy.source,
        meta: legacy.meta ?? { name: label },
        view: { id: legacy.id, label, widgets: legacy.views },
        availability: {
            catalog: true,
            defaultPlacement: { dashboardId: legacy.source },
        },
        ...(legacy.requires ? { requires: legacy.requires } : {}),
        ...(origin ? { origin } : {}),
    };
}

export function validateDashboardViewStructure(view: DashboardViewDefinition): string[] {
    const errors: string[] = [];
    if (view.schemaVersion !== DASHBOARD_SCHEMA_VERSION) {
        errors.push(`view.schemaVersion must be ${DASHBOARD_SCHEMA_VERSION}`);
    }
    validateViewReference("view.id", view.id, errors);
    validateRequiredId("view.source", view.source, errors);
    if (!view.meta?.name?.trim()) {
        errors.push("view.meta.name is required");
    }
    validateViewNode(view.view, "view.view", 1, errors);
    const placement = view.availability?.defaultPlacement;
    if (placement) {
        validateRequiredId("view.availability.defaultPlacement.dashboardId", placement.dashboardId, errors);
        if (placement.order !== undefined && (!Number.isInteger(placement.order) || placement.order < 0)) {
            errors.push("view.availability.defaultPlacement.order must be a non-negative integer");
        }
    }
    return errors;
}

export function validateDashboardStructure(dashboard: DashboardDefinition): string[] {
    const errors: string[] = [];
    if (dashboard.schemaVersion !== DASHBOARD_SCHEMA_VERSION) {
        errors.push(`dashboard.schemaVersion must be ${DASHBOARD_SCHEMA_VERSION}`);
    }
    validateRequiredId("dashboard.id", dashboard.id, errors);
    if (!dashboard.meta?.name?.trim()) {
        errors.push("dashboard.meta.name is required");
    }
    if (!dashboard.revision?.trim()) {
        errors.push("dashboard.revision is required");
    }
    if (dashboard.status !== "draft" && dashboard.status !== "published") {
        errors.push("dashboard.status must be draft or published");
    }
    if (!Array.isArray(dashboard.views)) {
        errors.push("dashboard.views must be an array");
        return errors;
    }
    if (dashboard.views.length === 0) {
        if (dashboard.homeView !== "") {
            errors.push("dashboard.homeView must be empty when dashboard.views is empty");
        }
        return errors;
    }
    validateMounts(dashboard.views, "dashboard.views", 1, errors);
    const paths = collectMountPaths(dashboard.views);
    if (!paths.has(dashboard.homeView)) {
        errors.push(`dashboard.homeView references unknown view path "${dashboard.homeView}"`);
    }
    return errors;
}

function validateViewNode(node: DashboardViewNode, path: string, depth: number, errors: string[]): void {
    if (!node || typeof node !== "object") {
        errors.push(`${path} must be an object`);
        return;
    }
    validateRequiredId(`${path}.id`, node.id, errors);
    if (!node.label?.trim()) {
        errors.push(`${path}.label is required`);
    }
    if (!Array.isArray(node.widgets)) {
        errors.push(`${path}.widgets must be an array`);
    } else {
        const dashboard: LegacyDashboardDefinition = {
            id: node.id,
            source: "view",
            views: node.widgets,
        };
        const widgetIds = new Set<string>();
        collectWidgetIds(node.widgets, `${path}.widgets`, widgetIds, errors);
        node.widgets.forEach((widget, index) =>
            validateWidget(widget, `${path}.widgets.${index}`, dashboard, null, widgetIds, errors),
        );
    }
    if (depth > DASHBOARD_MAX_VIEW_DEPTH) {
        errors.push(`${path} exceeds the maximum view depth of ${DASHBOARD_MAX_VIEW_DEPTH}`);
    }
    validateSiblingIds(node.children ?? [], `${path}.children`, errors);
    node.children?.forEach((child, index) => validateViewNode(child, `${path}.children.${index}`, depth + 1, errors));
}

function validateMounts(mounts: DashboardViewMount[], path: string, depth: number, errors: string[]): void {
    if (mounts.length === 0) {
        return;
    }
    if (depth > DASHBOARD_MAX_VIEW_DEPTH) {
        errors.push(`${path} exceeds the maximum view depth of ${DASHBOARD_MAX_VIEW_DEPTH}`);
    }
    validateSiblingIds(mounts, path, errors);
    mounts.forEach((mount, index) => {
        const mountPath = `${path}.${index}`;
        validateRequiredId(`${mountPath}.id`, mount.id, errors);
        if (mount.use) {
            validateViewReference(`${mountPath}.use`, mount.use, errors);
        }
        if (!mount.use && !mount.label?.trim()) {
            errors.push(`${mountPath}.label is required for a navigation group`);
        }
        validateMounts(mount.children ?? [], `${mountPath}.children`, depth + 1, errors);
    });
}

function validateViewReference(path: string, value: string | undefined, errors: string[]): void {
    if (
        !value ||
        value.length > 128 ||
        !/^[A-Za-z0-9](?:[A-Za-z0-9._/-]*[A-Za-z0-9])?$/.test(value) ||
        value.includes("..") ||
        value.includes("//")
    ) {
        errors.push(`${path} must be a safe view id`);
    }
}

function validateSiblingIds(items: Array<{ id: string }>, path: string, errors: string[]): void {
    const seen = new Set<string>();
    for (const item of items) {
        if (seen.has(item.id)) {
            errors.push(`${path} contains duplicate id "${item.id}"`);
        }
        seen.add(item.id);
    }
}

function collectMountPaths(mounts: DashboardViewMount[], parent = "", paths = new Set<string>()): Set<string> {
    for (const mount of mounts) {
        const path = parent ? `${parent}/${mount.id}` : mount.id;
        paths.add(path);
        collectMountPaths(mount.children ?? [], path, paths);
    }
    return paths;
}
