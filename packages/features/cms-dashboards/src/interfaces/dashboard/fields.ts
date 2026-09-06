import type {
    DashboardEndpointRef,
    DashboardDataRef,
    DashboardEmbeddedLookupRef,
    DashboardFieldExpression,
    DashboardLookupPresentation,
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

export type DashboardLookupRef = DashboardDataRef &
    DashboardLookupPresentation & {
        descriptionPaths?: string[];
        create?: DashboardLookupCreate;
    };

export type DashboardFieldBase = {
    id: string;
    label: string;
    path: string;
    required?: boolean;
    visibleWhen?: DashboardVisibilityRule;
};

export type DashboardPageLinkOptions = {
    publishedOnly?: boolean;
    allowExternal?: boolean;
    allowMedia?: boolean;
};

export type DashboardSelectableField = {
    options?: DashboardOption[];
    lookup?: DashboardLookupRef;
    allowCustom?: boolean;
};

type DashboardReorderableListItemFieldBase = {
    id: string;
    label: string;
    path: string;
    required?: boolean;
    placeholder?: string;
    secondary?: boolean;
};

export type DashboardReorderableListItemField = DashboardReorderableListItemFieldBase &
    (
        | { type?: "text"; options?: never; lookup?: never }
        | { type: "checkbox"; options?: never; lookup?: never }
        | { type: "secret-ref"; options?: never; lookup?: never }
        | ({ type: "page-link"; options?: never; lookup?: never } & DashboardPageLinkOptions)
        | { type: "select"; options: DashboardOption[]; lookup?: never }
        | { type: "combobox"; options?: DashboardOption[]; lookup?: DashboardEmbeddedLookupRef }
        | {
              type: "media";
              options?: never;
              lookup?: never;
              item: {
                  idPath?: string;
                  urlPath: string;
                  altPath?: string;
              };
              actions?: Partial<Record<"upload" | "replace" | "remove", DashboardEndpointRef>>;
          }
    );

export type DashboardSchemaExclusion = {
    from: DashboardFieldExpression;
    valuePath: string;
};

export type DashboardField =
    | (DashboardFieldBase & { type: "text"; placeholder?: string })
    | (DashboardFieldBase & { type: "cms-user"; placeholder?: string })
    | (DashboardFieldBase & { type: "secret-ref"; placeholder?: string })
    | (DashboardFieldBase & { type: "page-link"; placeholder?: string } & DashboardPageLinkOptions)
    | (DashboardFieldBase & {
          type: "number";
          placeholder?: string;
          min?: number;
          max?: number;
          step?: number;
      })
    | (DashboardFieldBase & {
          type: "money";
          placeholder?: string;
          currencyPath?: string;
          allowDecimals?: boolean | DashboardVisibilityRule;
      })
    | (DashboardFieldBase & { type: "checkbox" })
    | (DashboardFieldBase & { type: "textarea"; rows?: number })
    | (DashboardFieldBase & { type: "select"; options: DashboardOption[] })
    | (DashboardFieldBase & { type: "combobox" } & DashboardSelectableField)
    | (DashboardFieldBase & { type: "tokens" } & DashboardSelectableField)
    | (DashboardFieldBase & {
          type: "table";
          columns: DashboardTableColumn[];
          editable?: boolean;
          derive?: DashboardTableDerive;
          addLabel?: string;
      })
    | (DashboardFieldBase & {
          type: "reorderable-list";
          itemKey: string;
          positionPath?: string;
          layout?: "rows" | "cards";
          fields: DashboardReorderableListItemField[];
          addLabel?: string;
          minItems?: number;
          maxItems?: number;
      })
    | (DashboardFieldBase & {
          type: "schema";
          schema: DashboardDataRef;
          exclude?: DashboardSchemaExclusion;
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
