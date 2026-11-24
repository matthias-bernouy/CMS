# Build a minimal collection source snapshot

Use this when `prepare-collection` needs a complete `sourceJson`, or when diagnostics mention missing Bloc definitions, translations, roots, slots or examples. This example contains one panel and one reusable example. It has no dependency, browser script, theme or binary asset.

## Complete example

The following JSON is the complete snapshot object. Serialize it once as the `sourceJson` argument. File contents remain strings; do not pass nested objects as `content`. Replace `your-namespace` with a namespace you are authorized to publish. If changing `guide-kit` or `your-hnamespace--guide-kit--panel`, update all corresponding IDs, paths and HTML references consistently.

```json
{
  "files": [
    {
      "path": "definition.json",
      "content": "{\"kind\":\"collection\",\"protocol\":\"ulvia-collection/v1\",\"schemaDialect\":\"ulvia-schema/v1\",\"publisherId\":\"your-namespace\",\"collectionId\":\"your-namespace/guide-kit\",\"version\":\"1.0.0\",\"name\":\"collection.name\",\"locale\":\"en\"}"
    },
    {
      "path": "translations/en/base.json",
      "content": "{\"collection.name\":\"Guide kit\",\"bloc.label\":\"Panel\",\"bloc.description\":\"A panel containing editable prose.\"}"
    },
    {
      "path": "blocs/your-hnamespace--guide-kit--panel/definition.json",
      "content": "{\"kind\":\"component\",\"id\":\"your-hnamespace--guide-kit--panel\",\"label\":\"bloc.label\",\"description\":\"bloc.description\",\"categories\":[\"bloc.label\"],\"examples\":[\"panel\"],\"defaultExample\":\"panel\",\"root\":{\"accepts\":[\"div\"]},\"slots\":{\"body\":{\"accepts\":[{\"kind\":\"native-content\",\"profile\":\"prose\"}]}},\"uses\":[],\"requires\":[]}"
    },
    {
      "path": "blocs/your-hnamespace--guide-kit--panel/markup.html",
      "content": "<section><slot name=\"body\"></slot></section>"
    },
    {
      "path": "examples/panel/definition.json",
      "content": "{\"id\":\"panel\",\"label\":\"bloc.label\",\"description\":\"bloc.description\",\"previews\":[{\"id\":\"desktop\",\"frame\":{\"width\":640,\"height\":240}}]}"
    },
    {
      "path": "examples/panel/document.html",
      "content": "<div cms-bloc=\"your-hnamespace--guide-kit--panel\"><p slot=\"body\">Documentation sample</p></div>"
    }
  ]
}
```

The Bloc's `root.accepts` describes the native Page element carrying `cms-bloc`; here it is a `div`. The named `body` slot accepts prose and matches `slot="body"` on the example paragraph. The component's `markup.html` supplies its reusable rendering structure. The listed Bloc references its example by the example's declared ID, and `defaultExample` is one of those examples.

Translation keys used by labels, descriptions and categories must exist in the locale catalogue. This deliberately small learning example has literal Page copy. Production reusable copy can use collection texts or business-data bindings; follow the collection's conventions. Site-specific copy may be edited after copying an example into a Page.

## Optional JavaScript behavior

Official and third-party collections use the same behavior source format. For a
Bloc with `"kind": "component"`, add `blocs/<bloc-id>/bloc.ts` beside
`definition.json`, `markup.html` and optional `style.css`. The exact entry filename
is lowercase `bloc.ts`. Additional TypeScript modules belong in
`blocs/<bloc-id>/runtime/**/*.ts` and can be imported with relative paths such as
`import { helper } from "./runtime/helper"`. They need the `bloc.ts` entry to run.
Compositions cannot own behavior, styles or settings.

For an interactive version of the panel above, replace its `markup.html` with:

```html
<section>
    <button type="button" data-panel-toggle aria-expanded="true">{{ cms.i18n.your-namespace/guide-kit.toggle-content }}</button>
    <div data-panel-content><slot name="body"></slot></div>
</section>
```

Add these entries to the snapshot's `files` array for the button's reusable text:

```json
[
  {"path":"translations/en/behavior.json","content":"{\"text.toggle.label\":\"Toggle content\"}"},
  {"path":"texts/definitions/behavior.json","content":"[{\"id\":\"toggle-content\",\"category\":\"bloc.label\",\"group\":\"bloc.label\",\"label\":\"text.toggle.label\"}]"},
  {"path":"texts/locales/en/behavior.json","content":"{\"toggle-content\":\"Toggle content\"}"}
]
```

Add this TypeScript as the string `content` of the snapshot file
`blocs/your-hnamespace--guide-kit--panel/bloc.ts`:

```ts
export function mount(root: HTMLElement): () => void {
    const button = root.querySelector<HTMLButtonElement>("[data-panel-toggle]");
    const content = root.querySelector<HTMLElement>("[data-panel-content]");
    const onClick = () => {
        if (button && content) {
            content.hidden = !content.hidden;
            button.setAttribute("aria-expanded", String(!content.hidden));
        }
    };
    button?.addEventListener("click", onClick);
    return () => button?.removeEventListener("click", onClick);
}
```

Export the named `mount(root)` function directly from `bloc.ts`. It receives the
native element carrying `cms-bloc`; return cleanup for listeners or observers.
Preparation compiles the entry and its imported modules into `runtime.viewJS`
with the required browser ABI and automatic Bloc registration. Keep `runtime`,
`markup` and `style` out of the source `definition.json`.

Filenames such as `view.ts`, `view.js`, `behavior.js`, `behavior.ts`, `script.ts`
and `index.js`, and directories such as `view/` and `behavior/`, are unsupported
at the Bloc root. Use `bloc.ts` and `runtime/` instead. Behavior still follows
the [authoring restrictions and browser-code review](../collection-authoring.md).

## Binary assets from site files or a release

Keep file bytes out of textual tool arguments. After a successful workspace upload, add an exact immutable file generation to the snapshot's optional `assets` array:

```json
{"path":"assets/notice.txt","fileId":"<returned-file-id>","generation":"<returned-generation>"}
```

Do not also include that path in `files`. Use lowercase asset paths and a supported file extension. Do not put an `assets` declaration in `definition.json`; assets are discovered from the snapshot's materialized `assets/` files. In Page/example HTML, an asset URL can be referenced as `{{ cms.asset.your-namespace/guide-kit.notice.txt }}`.

Retained sources replace temporary site-file references with exact published asset references:

```json
{"path":"assets/notice.txt","publisherId":"<publisher>","collectionId":"your-namespace/guide-kit","version":"1.0.0","releaseDigest":"sha256:<digest>","assetId":"notice.txt"}
```

Keep those references when preparing the next version. Each asset uses either the file reference or the release reference, never both. A signed download URL is not an immutable asset reference. Publishing a collection intentionally makes its packaged assets available as release resources, even if the original workspace file was private.

## Validate and recover

The official Provider limits source JSON to 8 MiB UTF-8, 16,384 files including binary references, and 1,024 binary references. Paths are relative, cannot overlap by case or traverse directories, and include a root `definition.json`. Each text file is bounded to 1 MiB UTF-8 in both CLI capture and CMS preparation. Collection assets are limited to 10 MiB each and 50 MiB combined, independently of the source JSON budget. Collections admit up to 1,024 Blocs, 8,192 texts and 8,192 theme tokens. Each locale may define up to 65,536 metadata translation messages.

Keep source-only example files under `examples/`, not `default.html`. Collections do not define site Pages, and authored `migrations/` are unsupported. Treat `valid: false` and its diagnostics as a failed preparation even when the tool itself returned successfully. Correct sources, prepare again, then follow [publication and installation](../collection-authoring.md).
