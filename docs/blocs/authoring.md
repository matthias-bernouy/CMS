# Create A Bloc

This guide uses a small `example-card` custom element owned by a collection
integration.

## Folder And Manifest

Put every Bloc below a group directory:

```text
integrations/collections/example/
└── blocs/
    └── content/
        └── example-card/
            ├── manifest.json
            ├── Bloc.ts
            ├── BlocEditor.ts
            ├── template.html
            ├── style.css
            └── default.html
```

The collection definition decides which resource group exposes the Bloc. Keep
the source hierarchy descriptive and declare its category metadata explicitly.

```json
{
  "default-tag": "example-card",
  "bloc": "./Bloc.ts",
  "editor": "./BlocEditor.ts",
  "defaultContent": "./default.html",
  "meta": {
    "title": "Card",
    "description": "Groups related content on a themed surface."
  }
}
```

`default-tag` is the persisted identity and must be a valid custom-element
name. An integration cannot publish or replace a native HTML root. A collection
with kind `<kind>` owns both `<kind>/blocs/*` resource IDs and `<kind>-*` custom
elements; definitions outside either namespace are rejected. For example,
Mossa uses `mossa/blocs/*` and `mossa-*`. `bloc` defaults to `./Bloc.ts`;
`editor` is optional for a custom Bloc and produces an opaque editor when
omitted. `defaultContent` is optional and must remain inside the Bloc directory.
`meta.title` and `meta.description` label the catalogue entry.

Do not add inactive metadata merely for display: the site scanner currently
does not consume `runtime`, icon, author, image, or category metadata. The
folder owns the group.

## View Structure

`template.html` is the private Shadow DOM structure:

```html
<article part="card">
  <header part="header"><slot name="title"></slot></header>
  <div part="body"><slot></slot></div>
  <footer part="actions"><slot name="actions"></slot></footer>
</article>
```

Slots stay empty. Initial authored children belong in `default.html`:

```html
<example-card appearance="outlined">
  <h2 slot="title">Card title</h2>
  <p>Replace this text with the card content.</p>
  <a slot="actions" href="/contact">Contact us</a>
</example-card>
```

`default.html` is inserted when an author adds a new Bloc. Changing it does not
rewrite instances already saved in pages.

Files named `template.html` and `style.css` are conventions, not implicit
inputs. Import them from `Bloc.ts`:

```ts
import { Component } from "@bernouy/components/base";
import css from "./style.css" with { type: "text" };
import template from "./template.html" with { type: "text" };

export class ExampleCard extends Component {
    constructor() {
        super({ css, template });
    }
}
```

`Component` creates an open Shadow Root, inserts the stylesheet, and clones the
template. It deliberately provides no reactive framework. Use standard custom
element callbacks and DOM APIs when the Bloc needs behavior.

Export one runtime class and do not call `customElements.define()`. The
integration compiler selects the exported class and owns registration with the
manifest tag. Likewise, `BlocEditor.ts` exports its editor class without
registering it.

## Runtime Behavior

Keep behavior independent from the editor and clean up listeners when an
element disconnects:

```ts
export class ExampleDisclosure extends HTMLElement {
    #listeners: AbortController | undefined;

    connectedCallback(): void {
        this.#listeners?.abort();
        this.#listeners = new AbortController();
        this.querySelector("button")?.addEventListener("click", () => this.toggleAttribute("open"), {
            signal: this.#listeners.signal,
        });
    }

    disconnectedCallback(): void {
        this.#listeners?.abort();
        this.#listeners = undefined;
    }
}
```

Prefer semantic HTML over JavaScript. Use `<a href="/path">` for navigation;
direct `location.href`, `location.assign`, `location.replace`, and equivalent
`window.location` mutations are rejected. `history.pushState` is reserved for
transitions handled by the site's router.

View code is a browser bundle. Import public browser authoring entries such as
`@bernouy/components/base`; never import editor internals, Node or Bun APIs,
database adapters, secrets, or server-only feature modules.

## Native Elements

Native HTML is a platform capability, not a collection resource. The CMS editor
owns its constructors, editor definitions, catalogue placement rules, media
pickers, and attribute policy. The compiler rejects every integration artifact
whose root tag is native HTML, including a legacy artifact marked `native`.
Collections may still use semantic native elements inside a custom element's
template.

A custom Bloc may instead own one editable native Light DOM child through the
artifact-level `nativeElement` contract:

```json
{
  "type": "bloc",
  "bloc": {
    "tag": "example-link",
    "name": "Link",
    "nativeElement": "a",
    "path": "blocs/navigation/link",
    "view": "Bloc.ts"
  }
}
```

The default content must then contain exactly one direct, un-slotted child of
that type, for example
`<example-link><a href="/">Link</a></example-link>`. When no default content is
declared, insertion creates the required child. Control presents the wrapper
and native child as one logical tree node: collection settings remain on the
wrapper, while native attributes and direct text editing target the child.
Page writes and direct API calls validate the same structure server-side.

This V1 supports `h1` through `h6`, `p`, `a`, `button`, `img`, `svg`, and
`span`. Container elements with their own content-slot semantics are excluded.
Do not also declare an unnamed content slot or a wrapper text capability: the
managed native editor owns the child text contract.

The platform authoring set is intentionally narrow:

- `h1` through `h6`, `p`, `a`, `button`, `form`, `img`, `svg`, `section`, `ul`,
  and `ol` are authorable; media enters through the CMS picker, not a manifest;
- `span` is contextual and can only fill an explicit component slot;
- `li` is contextual and can only be placed directly in `ul` or `ol`;
- `strong`, `em`, and `code` are rich-text operations, not catalogue blocs;
- `article`, `nav`, `header`, `footer`, `main`, and `aside` are available for
  semantic template structure but are not global catalogue entries;
- `div`, `small`, `blockquote`, and `pre` have no native catalogue entry;
- legal tables use the structured `mossa-table` bloc instead of exposing
  `table`, `thead`, `tbody`, `tr`, `th`, and `td` separately.

Placement is catalogued data. It applies consistently when the editor offers,
inserts, replaces, moves, or pastes content; do not reproduce parent-tag or
slot checks ad hoc in UI components.

Native settings follow a deny-by-default policy. They never expose arbitrary
`class`, `style`, `slot`, `id`, `data-*`, `aria-*`, event (`on*`), or other
attributes. Required CMS binding and accessibility attributes may be generated
through typed controls:

- links use a CMS page, media, or external-URL picker, a controlled target, and
  derived safe `rel` values;
- `img` elements use same-site URLs ending in
  `/.cms/files/by-id/<opaque-id>`, require alternative text unless decorative,
  derive dimensions after loading, and expose only controlled loading behavior;
- SVGs must come from that CMS media namespace with matching MIME metadata;
  their fetched markup is sanitized before insertion, and the result requires
  either a decorative state or an accessible label;
- buttons expose static or dynamic text, `button`/`submit`, and `disabled`;
- forms bind to a declared endpoint and use the shared success redirect/reset
  controls; authors cannot enter a free `action` or `onsubmit`;
- headings and paragraphs expose static or dynamic rich text with links,
  strong emphasis, emphasis, and inline code, without visual attributes.

Visual form controls such as Mossa inputs, selectors, checkboxes, and filters
remain custom collection blocs, distinct from the data-only `forms` Source.
See [Expose Editing Capabilities](./editor.md) for the editor API.
