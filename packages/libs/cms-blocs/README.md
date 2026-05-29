# @bernouy/cms-blocs

CMS blocs and admin custom elements toolkit built with [Bun](https://bun.com) and TypeScript. Each component extends a minimal `Component` base that attaches an open Shadow Root and inlines its CSS + HTML template.

## Install

```bash
bun install
```

## Build

```bash
bun run build
```

Produces:

- `dist/index.js` — ESM entry exporting every component class. It does not register custom elements.
- `dist/blocs/<name>.mjs` — one ESM entry per component for consumers who only need a single class (e.g. `dist/blocs/button.mjs`, `dist/blocs/segmented-switch.mjs`).
- `dist/style.css` — default stylesheet (`src/assets/default.css`).
- `dist/**/*.d.ts` — TypeScript declarations (entry: `dist/index.d.ts`).

## Usage

### Register what you use

`@bernouy/cms-blocs` is classes-only. Consumers choose the tag names and register them explicitly.

```ts
import { Button } from "@bernouy/cms-blocs";

if (!customElements.get("p9r-button")) {
    customElements.define("p9r-button", Button);
}
```

### Single bloc

Only import what you use. The stylesheet stays shared.

```ts
import { Button } from "@bernouy/cms-blocs/blocs/button";

customElements.define("p9r-button", Button);
```

## Components

Two tag prefixes are currently in use across the library: `p9r-` (majority) and `w13c-` (subset). New components default to `p9r-` unless otherwise specified.

### Base

| Class | Description |
| --- | --- |
| `Component` | Abstract base class. Attaches an open Shadow Root and injects CSS + template. |

### Dialog

| Class | Tag | Description |
| --- | --- | --- |
| `FormDialog` | `<p9r-form-dialog>` | Modal dialog wrapping a form. |
| `LateralDialog` | `<w13c-lateral-dialog>` | Slide-in lateral dialog panel. |
| `Modal` | `<p9r-modal>` | Centered overlay modal with backdrop, controlled via `open` attribute. |
| `OpenModal` | `<p9r-open-modal>` | Trigger wrapper that opens a target `<p9r-modal>` by id on click. |

### Form

| Class | Tag | Description |
| --- | --- | --- |
| `Button` | `<p9r-button>` | Form-associated button with `variant` / `color` / `disabled`. |
| `Checkbox` | `<w13c-checkbox>` | Checkbox input. |
| `FormSection` | `<p9r-section>` | Groups form fields under a section header. |
| `IconButton` | `<p9r-icon-button>` | Square / round icon-only button with `variant` / `color` / `size`. |
| `InputFile` | `<w13c-input-file>` | File picker input. |
| `P9rInput` | `<p9r-input>` | Text input with validation. |
| `P9rRange` | `<p9r-range>` | Numeric range slider. |
| `P9rSelect` | `<p9r-select>` | Select dropdown. |
| `P9rSizesSelect` | `<p9r-sizes-select>` | Multi-size selector. |
| `Radio` | `<p9r-radio>` | Single radio button (use inside a `RadioGroup`). |
| `RadioGroup` | `<p9r-radio-group>` | Form-associated group of `<p9r-radio>` items with keyboard nav. |
| `SegmentedSwitch` | `<p9r-segmented-switch>` | Segmented toggle. |
| `Switch` | `<p9r-switch>` | Form-associated on/off toggle. |
| `TagSuggest` | `<p9r-tag-suggest>` | Autocomplete tag input. |
| `Textarea` | `<p9r-textarea>` | Multi-line text input with hint, counter, autosize. |

### Layout

| Class | Tag | Description |
| --- | --- | --- |
| `Card` | `<p9r-card>` | Container with `header` / `footer` slots and `variant` / `padding`. |
| `Divider` | `<p9r-divider>` | Horizontal / vertical separator with optional label. |
| `HorizontalActionGroup` | `<p9r-horizontal-action-group>` | Horizontal group of action buttons. |
| `LeftMenuLayout` | `<w13c-left-menu-layout>` | Page layout with a left menu. |
| `Stack` | `<p9r-stack>` | Flex container with token-based `gap`, `direction`, `align`/`justify`, `wrap`, optional `divider` between children. |

### Menu

| Class | Tag | Description |
| --- | --- | --- |
| `LateralMenu` | `<w13c-lateral-menu>` | Lateral navigation menu. |
| `LateralMenuItem` | `<w13c-lateral-menu-item>` | Item inside a `LateralMenu`. |

### Navigation

| Class | Tag | Description |
| --- | --- | --- |
| `Breadcrumb` | `<p9r-breadcrumb>` | Breadcrumb container with custom `separator`. |
| `BreadcrumbItem` | `<p9r-breadcrumb-item>` | Single crumb with `href` / `current`. |
| `Pagination` | `<p9r-pagination>` | Page numbers with `page` / `total` / `siblings` / `boundary`, emits `page-change`. |
| `Stepper` | `<p9r-stepper>` | Linear stepper with `current` / `orientation`. |
| `Step` | `<p9r-step>` | One step inside a `<p9r-stepper>`. |
| `Tabs` | `<p9r-tabs>` | Tab container with keyboard nav and `variant` (line / pills). |
| `TabPanel` | `<p9r-tab-panel>` | Single panel inside `<p9r-tabs>` (use `id` + `label`). |

### Disclosure

| Class | Tag | Description |
| --- | --- | --- |
| `Accordion` | `<p9r-accordion>` | Group of accordion items, single or `multiple` open. |
| `AccordionItem` | `<p9r-accordion-item>` | One collapsible row with `open` / `disabled`. |

### Table

| Class | Tag | Description |
| --- | --- | --- |
| `Table` | `<p9r-table>` | Table container. |
| `TableRow` | `<p9r-row>` | Table row. |
| `TableHeaderCell` | `<p9r-header-cell>` | Table header cell. |
| `TableCell` | `<p9r-cell>` | Table body cell. |

### Feedback

| Class | Tag | Description |
| --- | --- | --- |
| `Alert` | `<p9r-alert>` | Inline alert with `type` / `dismissible`, `title` slot, `dismiss` event. |
| `Progress` | `<p9r-progress>` | Linear progress with `value` / `max` / `indeterminate` / `color`. |
| `Skeleton` | `<p9r-skeleton>` | Shimmering placeholder with `shape` / `width` / `height`. |
| `Spinner` | `<p9r-spinner>` | Loading spinner with `size` / `color`. |
| `Toast` | `<p9r-toast>` | Single toast notification. |
| `ToastStack` | `<p9r-toast-stack>` | Stack container for toasts. |
| `Tooltip` | `<p9r-tooltip>` | Hover / focus tooltip with `text` / `position` / `delay`. |

### Display

| Class | Tag | Description |
| --- | --- | --- |
| `Avatar` | `<p9r-avatar>` | User avatar with `src` / `name` / `initials` / `size` / `shape`. |
| `Badge` | `<p9r-badge>` | Small status badge with `color` / `variant` / `size` / `dot`. |
| `Tag` | `<p9r-tag>` | Display tag / chip. |

## Development

```bash
bun install
bun --hot ./index.ts
```

To rebuild distribution artifacts after changes:

```bash
bun run build
```

## Adding a component

A new component lives under `src/ui/<Group>/<Name>/` with three files:

- `<Name>.ts` — extends `Component`, registers `customElements.define(...)`
- `style.css` — styles scoped to the Shadow Root
- `template.html` — HTML template

After creating the files, add the export to `src/index.ts` and a row to the catalog above.

This workflow is automated by a multi-agent setup in `.claude/agents/`:

- **`component-generator`** — the only agent that writes files. Creates the component folder, updates `src/index.ts`, and adds the README row.
- **`reviewer-accessibility`**, **`reviewer-api-dx`**, **`reviewer-consistency`**, **`reviewer-shadow-dom`** — read-only reviewers invoked in parallel to give multiple perspectives on the generated component. The main conversation arbitrates their feedback.
