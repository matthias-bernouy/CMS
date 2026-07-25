# Expose Editing Capabilities

`BlocEditor.ts` declares what Control may edit. It does not render the Bloc and
is never required by Delivery. Import the stable, browser-safe authoring
contract from `@bernouy/cms-content/editor`.

Control creates an `Editor` instance around the matching element in the canvas;
`Editor.target` is that real `HTMLElement`. Settings mutate its attributes,
slots organize its Light DOM children, and text capabilities edit its direct
content. Those DOM changes become the page content that is saved. The Bloc's
Shadow DOM remains owned by `Bloc.ts` and is not persisted as authored content.

```ts
import {
    Editor,
    type ContentSlot,
    type SettingSection,
} from "@bernouy/cms-content/editor";

export class SiteCardEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Presentation",
                settings: [
                    {
                        type: "segmented",
                        label: "Appearance",
                        attribute: "appearance",
                        defaultValue: "outlined",
                        options: [
                            { label: "Plain", value: "plain" },
                            { label: "Outlined", value: "outlined" },
                            { label: "Elevated", value: "elevated" },
                        ],
                    },
                    {
                        type: "toggle",
                        label: "Stretch to available height",
                        attribute: "stretch",
                        defaultValue: false,
                    },
                ],
            },
        ];
    }

    protected override contentSlots(): ContentSlot[] {
        return [
            {
                label: "Title",
                slot: "title",
                max: 1,
                accepts: [{ kind: "any-component" }],
            },
            {
                label: "Content",
                accepts: [{ kind: "any-component" }],
            },
            {
                label: "Actions",
                slot: "actions",
                accepts: [{ kind: "component", tag: "basic-button" }],
            },
        ];
    }
}
```

The site CLI discovers the exported class and registers it. Do not call
`registerEditor()` in a site-authored editor.

## Settings

A setting edits an attribute on `Editor.target`. The view and CSS then interpret
that attribute. This keeps saved content portable and makes the same behavior
available without Control.

| Type | Use |
| --- | --- |
| `text`, `textarea` | Free-form strings. |
| `select`, `segmented` | One value from labelled options. |
| `toggle` | Attribute presence for a boolean choice. |
| `page-link` | A CMS page, external URL, or media reference. |
| `endpoint-picker` | A CMS Source endpoint plus its method and optional body attributes. |
| `color` | A theme token or a custom color. |
| `row` | A visual group of several controls. |

Common metadata includes `label`, `attribute`, `help`, `placeholder`,
`required`, `disabled`, and `defaultValue`. `visibleWhen` conditionally exposes
a setting according to other target attributes; an array of rules is ANDed.
`attributesOnValue` applies or removes companion attributes for selected values.
Use `kind: "self"` for the normal Settings panel; `kind: "surcharge"` places a
section in Overrides. Metadata helps the authoring UI but does not replace
runtime validation or accessible HTML constraints.

`defaultValue` is an editor fallback when the attribute is absent. Merely
declaring it does not persist the attribute. Therefore the view and CSS must
make the absent-attribute case match the advertised default:

```css
:host,
:host([appearance="outlined"]) {
  border: 1px solid var(--site-card-border-color, currentColor);
}

:host([appearance="plain"]) {
  border-color: transparent;
}
```

A `toggle` always represents attribute presence. In particular,
`defaultValue: true` does not add a missing attribute: include that attribute in
`default.html` when new instances must start enabled.

Keep settings finite and semantic: `appearance="elevated"` is a stable content
contract; exposing arbitrary box shadows, padding for every breakpoint, or
server implementation details is not.

## Slots And Structure

`contentSlots()` controls insertion in the editor while using standard Light
DOM slots at runtime:

- omit `slot` for the default slot;
- set `slot` for a named `<slot name="...">` in the Shadow template;
- use `{ kind: "component", tag }` for one exact child type;
- use `{ kind: "any-component" }` for a generic container;
- use `{ kind: "media", accept: [...] }` for image, SVG, video, audio, or
  document media;
- use `min` and `max` to express cardinality.

These declarations guide the picker and basic insertion/removal controls; they
are not a complete DOM validator for existing content, paste, or every move.
The saved output is ordinary HTML, so the view must still render defensively if
old or externally edited content is incomplete.

For a text leaf, declare inline editing instead of an unnamed content slot:

```ts
import { Editor, type TextCapability } from "@bernouy/cms-content/editor";

export class SiteLabelEditor extends Editor {
    protected override textCapability(): TextCapability {
        return {
            format: "text",
            dynamic: true,
        };
    }
}
```

An editor cannot combine `textCapability()` with an unnamed content slot.
Named slot children are excluded from direct text editing. Keep editable text
in a semantic leaf rather than mixing raw text with arbitrary child elements.
Use `format: "richtext"` only when the saved element deliberately accepts HTML.
The current rich-text controls implement bold, italic, underline, code, link,
dynamic expressions, and size; `color` and `align` are typed but not currently
applied by the editor.

## Optional Advanced Contracts

- `dataScopes()` advertises named expression fields to authoring tools. It does
  not fetch data; fetching belongs to declarative bindings. Source aliases and
  repeat aliases also produce scopes automatically.
- `states()` exposes temporary preview states. `enter()` must return an `exit()`
  cleanup and must not persist preview-only state. States sharing a `group` are
  mutually exclusive.
- `structureMode()` may return `"opaque"` when the editor must treat internal
  authored structure as one unit. Omitting `editor` from a custom Bloc manifest
  also produces an opaque editor.
- `mountEditor()` and `unmountEditor()` are symmetrical hooks for editor-only
  listeners or overlays. Essential interaction belongs in `Bloc.ts`, not in
  these hooks.

Do not import Control implementation internals. Editor imports are mapped to
the shared browser editor runtime so all blocs use the same `Editor` identity.
