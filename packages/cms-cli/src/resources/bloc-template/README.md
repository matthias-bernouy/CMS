# configuration.html — Tag reference

`configuration.html` is the panel shown in the editor when a bloc is selected. It is built from a small set of custom elements (the `p9r-*` family) that automatically read and write back to the underlying component.

Two kinds of tags exist:

- **Sync wrappers** — bridge between the inputs and the live component (`p9r-attr-sync`, `p9r-comp-sync`, `p9r-image-sync`).
- **Inputs & layout** — the actual UI the user interacts with (`p9r-section`, `p9r-select`, `p9r-range`, `p9r-sizes-select`, `p9r-link`).

---

## Sync wrappers

### `<p9r-attr-sync>`

Wrap any set of inputs with a `name` attribute. On mount, each input is read from the matching attribute on the component; on `change`, the new value is written back to that attribute.

```html
<p9r-attr-sync>
    <select name="variant">
        <option selected value="filled">Filled</option>
        <option value="outline">Outline</option>
    </select>
    <p9r-range name="radius" label="Radius" min="0" max="32" unit="px"></p9r-range>
</p9r-attr-sync>
```

Any element exposing `name` + `value` works inside it: native `<select>`, `<input>`, or the `p9r-*` inputs below.

---

### `<p9r-comp-sync>`

Declares a slot of child components inside the current bloc. The single child element is the **default** that will be inserted if the slot is empty, and it also defines the `slot=""` name it targets.

```html
<p9r-comp-sync>
    <span>Button</span>
</p9r-comp-sync>

<p9r-comp-sync allow-multiple optionnal>
    <w13c-card slot="cards"></w13c-card>
</p9r-comp-sync>
```

Attributes:

| Attribute                     | Effect                                                                          |
| ----------------------------- | ------------------------------------------------------------------------------- |
| *(none)*                      | User can swap the child for a different bloc type (default).                    |
| `allow-multiple`              | User can add, duplicate, reorder and delete items.                              |
| `optionnal`                   | User can delete the item (ignored when `allow-multiple` is set).                |
| `disable-others-components`   | Opt-out: forbid swapping the child. Use to lock the slot to its current tag.    |
| `inline-adding`               | *(with `allow-multiple`)* Places `+ before` / `+ after` on the left/right of each item instead of above/below — for horizontal lists. |

Sub-components never get their own editor — their parent manages them through `p9r-comp-sync`.

---

### `<p9r-image-sync>`

Image picker bound to an `<img>` living in a named slot of the component. Clicking the card opens the MediaCenter.

```html
<p9r-image-sync slotTarget="icon-left" label="Left icon"></p9r-image-sync>
<p9r-image-sync slotTarget="cover" label="Cover" default="https://placehold.co/800x450"></p9r-image-sync>
```

| Attribute    | Description                                             |
| ------------ | ------------------------------------------------------- |
| `slotTarget` | Name of the slot that holds the `<img>` in the bloc.    |
| `label`      | Label shown above the preview.                          |
| `default`    | Optional default `src` inserted if the slot is empty.   |
| `accept`     | Media types for the MediaCenter (default `image`).      |

---

## Layout

### `<p9r-section>`

Collapsible card used to group related inputs. Always wrap your inputs in sections.

```html
<p9r-section data-title="Style">
    ...
</p9r-section>

<p9r-section data-title="Advanced" data-collapsed>
    ...
</p9r-section>
```

| Attribute        | Description                                     |
| ---------------- | ----------------------------------------------- |
| `data-title`     | Section title shown in the header.              |
| `data-collapsed` | Start the section collapsed.                    |

---

## Inputs

All inputs below expose `name` and `value`, so they work seamlessly inside `<p9r-attr-sync>`.

### `<p9r-select>`

Styled dropdown. Options are declared as native `<option>` children.

```html
<p9r-select name="variant" label="Variant">
    <option value="filled" selected>Filled</option>
    <option value="outline">Outline</option>
    <option value="ghost">Ghost</option>
</p9r-select>
```

| Attribute | Description                                           |
| --------- | ----------------------------------------------------- |
| `name`    | Attribute name written to the component.              |
| `label`   | Label shown above the field (falls back to `name`).   |

> Note: a bare `<select name="...">` also works inside `p9r-attr-sync`, but `p9r-select` matches the visual style of the other inputs.

---

### `<p9r-range>`

Slider + number input combo for numeric values.

```html
<p9r-range name="radius" label="Radius" min="0" max="32" step="1" value="16" unit="px"></p9r-range>
```

| Attribute | Description                                |
| --------- | ------------------------------------------ |
| `name`    | Attribute name written to the component.   |
| `label`   | Label shown above the field.               |
| `min`     | Minimum value (default `0`).               |
| `max`     | Maximum value (default `100`).             |
| `step`    | Step increment (default `1`).              |
| `value`   | Initial value (defaults to `min`).         |
| `unit`    | Unit shown next to the number (e.g. `px`). |

---

### `<p9r-sizes-select>`

Shortcut for a `p9r-select` preloaded with the `NONE / XS / S / M / L / XL` scale used across the design system.

```html
<p9r-sizes-select name="size" label="Size"></p9r-sizes-select>
```

The written values are `none`, `xs`, `sm`, `md` (default), `lg`, `xl`.

---

### `<p9r-link>`

Link picker with three tabs — internal **Page** (fetched from the admin API), free-form **External URL**, and **Media** file (opens the MediaCenter). Ideal for `href`-style attributes.

```html
<p9r-link name="href" label="Link"></p9r-link>
```

| Attribute | Description                                     |
| --------- | ----------------------------------------------- |
| `name`    | Attribute name written to the component.        |
| `label`   | Optional label shown above the field.           |

---

## Conventions

### Prefer CSS variables

Use CSS variables as much as possible — both for local values inside the bloc and for global design tokens. This keeps blocs themeable and consistent with the rest of the UI.

Define local variables at the top of `:host` with a sensible fallback from a global token:

```css
:host {
    --card-bg: var(--primary-muted, #eef2ff);
    --card-fg: var(--text-main, #1e293b);
    --card-radius: 12px;
}
```

Then drive attribute-based variants by reassigning the locals, never by rewriting the final properties:

```css
:host([color="danger"])   { --card-bg: var(--danger-muted); }
:host([variant="outline"]) {
    --card-bg: transparent;
    --card-border: var(--primary-base);
}
```

### Global design tokens

These are declared via `@property` in `src/endpoints/admin-css/system/colors.css` and are available everywhere (they pierce the Shadow DOM because custom properties are inherited).

**Colors** — every family exposes `base`, `muted`, and `contrasted`:

| Family    | Variables                                                         |
| --------- | ----------------------------------------------------------------- |
| Primary   | `--primary-base`, `--primary-muted`, `--primary-contrasted`       |
| Secondary | `--secondary-base`, `--secondary-muted`, `--secondary-contrasted` |
| Success   | `--success-base`, `--success-muted`, `--success-contrasted`       |
| Danger    | `--danger-base`, `--danger-muted`, `--danger-contrasted`          |
| Warning   | `--warning-base`, `--warning-muted`, `--warning-contrasted`       |
| Info      | `--info-base`, `--info-muted`, `--info-contrasted`                |

**Surfaces & text:**

| Variable           | Role                                        |
| ------------------ | ------------------------------------------- |
| `--bg-base`        | Page background.                            |
| `--bg-surface`     | Elevated surfaces (cards, panels, modals).  |
| `--bg-overlay`     | Overlays (popovers, dropdowns).             |
| `--text-main`      | Primary text color.                         |
| `--text-body`      | Body copy.                                  |
| `--text-muted`     | Secondary / helper text.                    |
| `--border-default` | Default border color.                       |

---

## Making a bloc non-editable

Everything in the bloc folder is optional except `Bloc.ts` and `template.html`. Two rules to keep in mind:

- **No `editor` field in `manifest.json` → the bloc has no editor panel.** The bloc is rendered but cannot be configured from the interface. This is sometimes exactly what you want (static decorative blocs, fixed-layout templates, marketing headers, …). In that case `BlocEditor.ts`, `configuration.html` and any configuration assets are not needed at all — you can simply omit them.
- **Non-editable blocs freeze their contents.** If a bloc is not editable and its template embeds other (external) blocs, those external blocs also become non-editable: the editor will not expose them, they cannot be moved, replaced, duplicated, or configured individually. Use this on purpose when you want to ship a "locked" composition where the outer bloc acts as a sealed container around a fixed arrangement of children.

---

## Full example

```html
<p9r-attr-sync>
    <p9r-section data-title="Style">
        <p9r-select name="variant" label="Variant">
            <option selected value="filled">Filled</option>
            <option value="outline">Outline</option>
            <option value="ghost">Ghost</option>
        </p9r-select>
        <p9r-range name="radius" label="Radius" min="0" max="32" unit="px"></p9r-range>
    </p9r-section>

    <p9r-section data-title="Link">
        <p9r-link name="href" label="Link"></p9r-link>
    </p9r-section>
</p9r-attr-sync>

<p9r-section data-title="Media">
    <p9r-image-sync slotTarget="icon-left" label="Left icon"></p9r-image-sync>
    <p9r-image-sync slotTarget="icon-right" label="Right icon"></p9r-image-sync>
</p9r-section>

<p9r-comp-sync>
    <span>Button</span>
</p9r-comp-sync>
```
