# Dashboard Widget Plan

## Goal

Define the new source-owned dashboard widget contract before reconnecting
official integrations. The current UI foundation is:

- `w-table` for resource lists.
- `w-detail` for editable resource pages with main and aside sections.
- `w-section` for reusable framed sections.
- `w-media-field` for source-owned media selection, upload, replacement,
  removal, and reorder.

The old create/update/delete/action/resource-page string-rendered runtime should
not be carried forward as the primary contract.

## Principles

- Widgets describe UI and source calls. They do not implement persistence.
- Sources own their data, media, lookup creation, and save actions.
- The dashboard runtime translates widget events into declared source endpoint
  calls.
- Static options and dynamic lookup options are separate concepts.
- A selected lookup value may be an id while the displayed item is a richer
  object resolved through a source endpoint.
- The contract should expose More actions grouping explicitly instead of relying
  only on button count heuristics.

## Top-Level Definition

```ts
type DashboardDefinition = {
  id: string;
  source: string;
  meta?: DashboardMeta;
  views: DashboardWidget[];
};

type DashboardMeta = {
  name: string;
  icon?: string;
  svg?: string;
};
```

## Widgets

```ts
type DashboardWidget =
  | DashboardTableWidget
  | DashboardDetailWidget
  | DashboardSectionWidget
  | DashboardTabsWidget;
```

```ts
type DashboardSectionWidget = {
  widget: "section";
  id: string;
  title?: string;
  children: DashboardWidget[];
};

type DashboardTabsWidget = {
  widget: "tabs";
  id: string;
  tabs: Array<{
    label: string;
    children: DashboardWidget[];
  }>;
};
```

## Table Widget

```ts
type DashboardTableWidget = {
  widget: "table";
  id: string;
  title?: string;
  source: DashboardDataSourceRef;
  rowKey: string;
  columns: DashboardColumn[];
  filters?: DashboardFilter[];
  selection?: {
    opens?: string;
  };
};

type DashboardColumn = {
  id: string;
  label: string;
  path: string;
  primary?: boolean;
  width?: string;
  format?: "text" | "badge" | "date" | "money";
};
```

## Detail Widget

```ts
type DashboardDetailWidget = {
  widget: "detail";
  id: string;
  source: DashboardDataSourceRef;
  title?: DashboardBinding;
  status?: DashboardBinding;
  actions?: DashboardAction[];
  main: DashboardSection[];
  aside?: DashboardSection[];
};

type DashboardSection = {
  id: string;
  title: string;
  description?: string;
  fields: DashboardField[];
};
```

## Fields

```ts
type DashboardField =
  | DashboardTextField
  | DashboardTextareaField
  | DashboardSelectField
  | DashboardComboboxField
  | DashboardTokensField
  | DashboardMediaField
  | DashboardReadonlyField;
```

```ts
type DashboardBaseField = {
  id: string;
  label: string;
  path: string;
  required?: boolean;
  visibleWhen?: DashboardVisibilityRule;
};

type DashboardTextField = DashboardBaseField & {
  type: "text";
  editable?: boolean;
};

type DashboardTextareaField = DashboardBaseField & {
  type: "textarea";
  editable?: boolean;
};

type DashboardReadonlyField = DashboardBaseField & {
  type: "readonly";
};

type DashboardSelectField = DashboardBaseField & {
  type: "select";
  options: DashboardOption[];
};

type DashboardComboboxField = DashboardBaseField & {
  type: "combobox";
  options?: DashboardOption[];
  lookup?: DashboardLookupRef;
  creatable?: boolean;
};

type DashboardTokensField = DashboardBaseField & {
  type: "tokens";
  options?: DashboardOption[];
  lookup?: DashboardLookupRef;
  creatable?: boolean;
};
```

## Static Options

`DashboardOption` is for static choices only.

```ts
type DashboardOption = {
  label: string;
  value: string;
};
```

Dynamic suggestions use `DashboardLookupRef`.

## Lookup Contract

Lookups must separate:

- the stored value, usually an id;
- the selected object returned by the source;
- the label displayed in the combobox or token input.

```ts
type DashboardLookupRef = {
  endpoint: DashboardEndpointCall;
  itemsPath?: string;
  valuePath: string;
  labelPath: string;
  subtitlePath?: string;
  mediaPath?: string;
  descriptionPaths?: string[];
  selected?: DashboardSelectedLookupRef;
  create?: DashboardLookupCreate;
};

type DashboardSelectedLookupRef = {
  endpoint: DashboardEndpointCall;
  itemPath?: string;
};
```

`selected` is needed when a resource only stores `brandId`, but the UI must
display `brand.name` after loading the detail view.

Example:

```ts
{
  type: "combobox",
  id: "brand",
  label: "Brand",
  path: "brandId",
  lookup: {
    endpoint: {
      id: "brands.search",
      params: { q: "$search" }
    },
    itemsPath: "items",
    valuePath: "id",
    labelPath: "name",
    subtitlePath: "country",
    selected: {
      endpoint: {
        id: "brands.get",
        params: { id: "$value" }
      },
      itemPath: "item"
    }
  }
}
```

## Lookup Creation

Lookup creation can be inline for simple objects or modal-based for richer
objects.

```ts
type DashboardLookupCreate =
  | {
      mode: "inline";
      endpoint: DashboardEndpointCall;
      valuePath: string;
      labelPath: string;
    }
  | {
      mode: "modal";
      title: string;
      fields: DashboardField[];
      endpoint: DashboardEndpointCall;
      valuePath: string;
      labelPath: string;
    };
```

Inline example:

```ts
create: {
  mode: "inline",
  endpoint: {
    id: "brands.create",
    body: { name: "$search" }
  },
  valuePath: "id",
  labelPath: "name"
}
```

Modal example:

```ts
create: {
  mode: "modal",
  title: "Create brand",
  fields: [
    { type: "text", id: "name", label: "Name", path: "name", required: true },
    { type: "text", id: "country", label: "Country", path: "country" }
  ],
  endpoint: {
    id: "brands.create",
    body: {
      name: "$field.name",
      country: "$field.country"
    }
  },
  valuePath: "id",
  labelPath: "name"
}
```

## Actions

Actions must explicitly support visible buttons and More actions sections.

```ts
type DashboardAction = {
  id: string;
  label: string;
  tone?: "primary" | "secondary" | "danger";
  icon?: string;
  placement?: "primary" | "secondary" | "more";
  section?: string;
  endpoint: DashboardEndpointCall;
  confirm?: string;
};
```

Rendering defaults can still exist:

- first action defaults to `primary`;
- next two actions default to `secondary`;
- remaining actions default to `more`;
- `section` groups actions inside the More actions menu.

Explicit `placement` always wins.

## Media Field

Media is source-owned. The dashboard widget only handles UI events.

```ts
type DashboardMediaField = DashboardBaseField & {
  type: "media";
  accept?: string;
  maxItems?: number;
  actions: DashboardMediaActions;
};

type DashboardMediaActions = {
  upload?: DashboardEndpointCall;
  replace?: DashboardEndpointCall;
  remove?: DashboardEndpointCall;
  reorder?: DashboardEndpointCall;
};
```

The runtime emits normalized media actions with:

- resource id;
- field id;
- action name;
- current media value;
- file or files when relevant;
- source-owned media item ids when relevant.

## Nested Resource List Field

Product variants cannot be represented cleanly with the current `w-detail`
field set. A Shopify-style product page needs a nested editable resource list
inside the product detail, with row-level editing and per-row media actions.
This is not a separate top-level dashboard tab.

Proposed contract to validate before implementation:

```ts
type DashboardNestedListField = DashboardBaseField & {
  type: "nested-list";
  source: DashboardDataSourceRef;
  rowKey: string;
  columns: DashboardColumn[];
  create?: DashboardEndpointCall;
  update?: DashboardEndpointCall;
  remove?: DashboardEndpointCall;
  rowDetail?: {
    title?: DashboardBinding;
    fields: DashboardField[];
    actions?: DashboardAction[];
  };
};
```

For Products, this would let `productDetail` own a `variants` section that:

- loads `variants?productId=$resource.id`;
- edits SKU, title, status, default flag and option values per variant;
- opens a row detail or inline row editor;
- uses the existing `media` field inside each variant row detail for variant
  images;
- keeps brand and categories on the product detail, not as separate top-level
  tabs.

## Endpoint Calls

```ts
type DashboardEndpointCall = {
  id: string;
  params?: Record<string, DashboardExpr>;
  body?: Record<string, DashboardExpr>;
};

type DashboardDataSourceRef = DashboardEndpointCall & {
  itemsPath?: string;
  itemPath?: string;
};

type DashboardBinding = {
  path: string;
  fallback?: string;
};
```

Useful expressions:

```ts
type DashboardExpr = string;
```

Supported expression values should include:

- `$row.<path>`;
- `$resource.<path>`;
- `$field.<fieldId>`;
- `$media.<path>`;
- `$search`;
- `$value`;
- string literals.

The type can stay `string`; validation should enforce known expression forms.

## Validation Notes

The dashboard validator should:

- reject unsupported widget types;
- validate widget ids are unique within a dashboard;
- validate endpoint ids exist on the source when a source is available;
- validate paths use safe dot notation;
- validate lookup mappings include `valuePath` and `labelPath`;
- validate `lookup.create.mode = "modal"` has fields and endpoint;
- validate media actions reference valid endpoints;
- validate action placement and section values.

## Migration Steps

1. Replace `interfaces/Dashboard.ts` with the new widget-first contract.
2. Update `validateDashboard` for the new contract only.
3. Add tests for table, detail, action placement, lookup selected resolution,
   inline create, modal create, and media actions.
4. Update the control dashboard runtime to map the new contract to `w-table` and
   `w-detail`.
5. Rework official integrations one by one onto the new contract.
6. Remove legacy declarative widgets from official integration definitions.
