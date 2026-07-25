# Create A Bloc

This guide uses a small `site-card` custom element. The default site root is
`site/`; `p9r.config.json` may replace it with `siteDir`.

## Folder And Manifest

Put every Bloc below a group directory:

```text
site/
└── blocs/
    └── Content/
        └── site-card/
            ├── manifest.json
            ├── Bloc.ts
            ├── BlocEditor.ts
            ├── template.html
            ├── style.css
            └── default.html
```

The immediate parent directory defines the catalogue group. Use
`_uncategorized` for no group. A Bloc directly below `site/blocs/` is ignored;
there is no `default-group` manifest field.

```json
{
  "default-tag": "site-card",
  "bloc": "./Bloc.ts",
  "editor": "./BlocEditor.ts",
  "defaultContent": "./default.html",
  "meta": {
    "title": "Card",
    "description": "Groups related content on a themed surface."
  }
}
```

`default-tag` is the persisted identity. It must be a valid custom-element name
for a custom Bloc; supported native entries such as `img` and `p` are the
exception. `bloc` defaults to `./Bloc.ts`; `editor` is optional for a custom
Bloc and produces an opaque editor when omitted. `defaultContent` is optional
and must remain inside the Bloc directory. `meta.title` and
`meta.description` label the catalogue entry.

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
<site-card appearance="outlined">
  <h2 slot="title">Card title</h2>
  <p>Replace this text with the card content.</p>
  <a slot="actions" href="/contact">Contact us</a>
</site-card>
```

`default.html` is inserted when an author adds a new Bloc. Changing it does not
rewrite instances already saved in pages or templates.

Files named `template.html` and `style.css` are conventions, not implicit
inputs. Import them from `Bloc.ts`:

```ts
import { Component } from "@bernouy/components/base";
import css from "./style.css" with { type: "text" };
import template from "./template.html" with { type: "text" };

export class SiteCard extends Component {
    constructor() {
        super({ css, template });
    }
}
```

`Component` creates an open Shadow Root, inserts the stylesheet, and clones the
template. It deliberately provides no reactive framework. Use standard custom
element callbacks and DOM APIs when the Bloc needs behavior.

For a site-authored Bloc, export one runtime class and do not call
`customElements.define()`. The CLI wrapper selects the exported class and owns
registration with the manifest tag. Likewise, a site `BlocEditor.ts` exports
its editor class without registering it. Integration resource sources compiled
directly through the lower-level `prepare_bloc` API follow their package's
placeholder-registration convention; do not copy that convention into
`site/blocs/`.

## Runtime Behavior

Keep behavior independent from the editor and clean up listeners when an
element disconnects:

```ts
export class SiteDisclosure extends HTMLElement {
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

The catalogue can also provide editor behavior for supported native tags such
as `img`, `p`, `form`, and form controls. A native entry has no view bundle and
must provide an editor entry. Use this only when the saved element should
remain native HTML; use a hyphenated custom tag when the Bloc owns runtime
structure or behavior.

Next, describe authoring controls in
[Expose Editing Capabilities](./editor.md).
