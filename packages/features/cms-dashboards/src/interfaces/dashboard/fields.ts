import type {
    DashboardEndpointRef,
    DashboardDataRef,
    DashboardOption,
    DashboardTableColumn,
    DashboardTableDerive,
    DashboardVisibilityRule,
} from "./refs";

export type DashboardLookupCreate =
    | (DashboardEndpointRef & {
        mode: "inline";
        valuePath: string;
        labelPath: string;
    })
    | (DashboardEndpointRef & {
        mode: "modal";
        title?: string;
        valuePath: string;
        labelPath: string;
        fields: DashboardField[];
    });

export type DashboardLookupRef = DashboardDataRef & {
    valuePath: string;
    labelPath: string;
    subtitlePath?: string;
    mediaPath?: string;
    descriptionPaths?: string[];
    selected?: DashboardDataRef;
    create?: DashboardLookupCreate;
};

export type DashboardFieldBase = {
    id: string;
    label: string;
    path: string;
    required?: boolean;
    visibleWhen?: DashboardVisibilityRule;
};

export type DashboardSelectableField = {
    options?: DashboardOption[];
    lookup?: DashboardLookupRef;
    allowCustom?: boolean;
};

export type DashboardReorderableListItemField = {
    id: string;
    label: string;
    path: string;
    required?: boolean;
    placeholder?: string;
};

export type DashboardField =
    | (DashboardFieldBase & { type: "text"; placeholder?: string })
    | (DashboardFieldBase & { type: "textarea"; rows?: number })
    | (DashboardFieldBase & { type: "select"; options: DashboardOption[] })
    | (DashboardFieldBase & { type: "combobox" } & DashboardSelectableField)
    | (DashboardFieldBase & { type: "tokens" } & DashboardSelectableField)
    | (DashboardFieldBase & {
        type: "table";
        columns: DashboardTableColumn[];
        editable?: boolean;
        derive?: DashboardTableDerive;
    })
    | (DashboardFieldBase & {
        type: "reorderable-list";
        itemKey: string;
        positionPath?: string;
        fields: DashboardReorderableListItemField[];
        addLabel?: string;
        minItems?: number;
        maxItems?: number;
    })
    | (DashboardFieldBase & {
        type: "media";
        multiple?: boolean;
        item: {
            idPath?: string;
            urlPath: string;
            altPath?: string;
        };
        actions?: Partial<Record<"upload" | "replace" | "remove" | "reorder", DashboardEndpointRef>>;
    })
    | (DashboardFieldBase & {
        type: "readonly";
        format?: "text" | "badge" | "date" | "money" | "url" | "image";
    });

export type DashboardSection = {
    id: string;
    title: string;
    description?: string;
    fields: DashboardField[];
};
