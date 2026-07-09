import type { DataShape } from "./DataShape";

export const SOURCE_OVERLAY_FIELD_TYPES = ["string", "number", "boolean"] as const;
export type SourceOverlayFieldType = typeof SOURCE_OVERLAY_FIELD_TYPES[number];

export const SOURCE_OVERLAY_EDITABLE_SCOPES = ["self", "admin", "all"] as const;
export type SourceOverlayEditableScope = typeof SOURCE_OVERLAY_EDITABLE_SCOPES[number];

export type SourceOverlayField = {
    id: string;
    label: string;
    type: SourceOverlayFieldType;
    /**
     * Dotted object path relative to the targeted input/output object.
     * Defaults to `metadata.<id>`.
     */
    path?: string;
    section?: string;
    required?: boolean;
    selfEditable?: boolean;
    adminEditable?: boolean;
    showInDashboardTable?: boolean;
    exposeToEditorSources?: boolean;
};

export type SourceOverlaySection = {
    id: string;
    label: string;
    description?: string;
};

export type SourceOverlayEndpointTarget = {
    endpointId: string;
    /**
     * Object path inside the endpoint body where overlay field paths are
     * attached. Use `accounts[]` to target each item of an array property.
     */
    path?: string;
    editable?: SourceOverlayEditableScope;
};

export type SourceOverlayFieldSourceMap = {
    id?: string;
    label?: string;
    type?: string;
    path?: string;
    section?: string;
    required?: string;
    selfEditable?: string;
    adminEditable?: string;
    showInDashboardTable?: string;
    exposeToEditorSources?: string;
};

export type SourceOverlayFieldSource = {
    endpointId: string;
    path?: string;
    map?: SourceOverlayFieldSourceMap;
};

export type SourceOverlayDashboardEndpointRef = {
    sourceId?: string;
    endpoint: string;
    params?: Record<string, string>;
    body?: Record<string, string>;
};

export type SourceOverlayDashboardDataRef = SourceOverlayDashboardEndpointRef & {
    itemsPath?: string;
    itemPath?: string;
    totalPath?: string;
};

export type SourceOverlayDashboardOption = {
    value: string;
    label: string;
    subtitle?: string;
    media?: string;
};

export type SourceOverlayDashboardLookupRef = SourceOverlayDashboardDataRef & {
    valuePath: string;
    labelPath: string;
    subtitlePath?: string;
    mediaPath?: string;
    descriptionPaths?: string[];
    selected?: SourceOverlayDashboardDataRef;
};

export type SourceOverlayDashboardFieldPatch = {
    label?: string;
    type?: "text" | "textarea" | "select" | "combobox" | "tokens" | "readonly";
    required?: boolean;
    options?: SourceOverlayDashboardOption[];
    lookup?: SourceOverlayDashboardLookupRef;
    allowCustom?: boolean;
};

export type SourceOverlayDashboardField = {
    dashboardId?: string;
    viewId: string;
    fieldId?: string;
    path?: string;
    field: SourceOverlayDashboardFieldPatch;
};

export type SourceOverlay = {
    id: string;
    sourceId: string;
    label?: string;
    input?: SourceOverlayEndpointTarget[];
    output?: SourceOverlayEndpointTarget[];
    fieldSource?: SourceOverlayFieldSource;
    sections?: SourceOverlaySection[];
    dashboardFields?: SourceOverlayDashboardField[];
    fields: SourceOverlayField[];
};

export interface SourceOverlayRepository {
    getOverlay(id: string): Promise<SourceOverlay | null>;
    getOverlaysForSource(sourceId: string): Promise<SourceOverlay[]>;
    getAllOverlays(): Promise<SourceOverlay[]>;
    upsertOverlay(overlay: SourceOverlay): Promise<SourceOverlay>;
    deleteOverlay(id: string): Promise<boolean>;
}

export function sourceOverlayFieldShape(field: Pick<SourceOverlayField, "type">): DataShape {
    return { type: field.type };
}
