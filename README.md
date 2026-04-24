# @bernouy/webcomponents

Lightweight Web Components toolkit built with [Bun](https://bun.com) and TypeScript. Each component extends a minimal `Component` base that attaches an open Shadow Root and inlines its CSS + HTML template.

## Install

```bash
bun install
```

## Usage

Importing a component registers its custom element as a side effect.

```ts
import { Button, Toast } from "@bernouy/webcomponents";
```

```html
<p9r-button variant="filled">Click me</p9r-button>
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

### Form

| Class | Tag | Description |
| --- | --- | --- |
| `Button` | `<p9r-button>` | Form-associated button with `variant` / `color` / `disabled`. |
| `Checkbox` | `<w13c-checkbox>` | Checkbox input. |
| `FormSection` | `<p9r-section>` | Groups form fields under a section header. |
| `InputFile` | `<w13c-input-file>` | File picker input. |
| `P9rInput` | `<p9r-input>` | Text input with validation. |
| `P9rRange` | `<p9r-range>` | Numeric range slider. |
| `P9rSelect` | `<p9r-select>` | Select dropdown. |
| `P9rSizesSelect` | `<p9r-sizes-select>` | Multi-size selector. |
| `SegmentedSwitch` | `<p9r-segmented-switch>` | Segmented toggle. |
| `TagSuggest` | `<p9r-tag-suggest>` | Autocomplete tag input. |

### Layout

| Class | Tag | Description |
| --- | --- | --- |
| `HorizontalActionGroup` | `<p9r-horizontal-action-group>` | Horizontal group of action buttons. |
| `LeftMenuLayout` | `<w13c-left-menu-layout>` | Page layout with a left menu. |

### Menu

| Class | Tag | Description |
| --- | --- | --- |
| `LateralMenu` | `<w13c-lateral-menu>` | Lateral navigation menu. |
| `LateralMenuItem` | `<w13c-lateral-menu-item>` | Item inside a `LateralMenu`. |

### Table

| Class | Tag | Description |
| --- | --- | --- |
| `Table` | `<p9r-table>` | Table container. |
| `TableRow` | `<p9r-row>` | Table row. |
| `TableHeaderCell` | `<p9r-header-cell>` | Table header cell. |
| `TableCell` | `<p9r-cell>` | Table body cell. |

### Other

| Class | Tag | Description |
| --- | --- | --- |
| `Tag` | `<p9r-tag>` | Display tag / chip. |
| `Toast` | `<p9r-toast>` | Single toast notification. |
| `ToastStack` | `<p9r-toast-stack>` | Stack container for toasts. |

## Development

```bash
bun install
bun --hot ./index.ts
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
