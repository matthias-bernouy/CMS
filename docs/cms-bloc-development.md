# AI Agent Guidelines: Component Development

## 1. Asset Management: Images Over Web Fonts
* **Guideline:** Strictly avoid using HTML icon fonts (e.g., FontAwesome)[cite: 1]. 
* **Action:** Use image formats (**SVG**, **PNG**, **JPEG**) for all icons and graphic assets[cite: 1].
* **Reasoning:** Images offer better scalability, easier styling, and can be performance-optimized (compression, lazy-loading) more effectively than font files[cite: 1].

## 2. Performance: Pre-compute Logic
* **Guideline:** Offload complex calculations (positions, dimensions, data mapping) to the **editor side** rather than the client-side[cite: 1].
* **Reasoning:** Passing pre-computed values via attributes or properties reduces the JavaScript execution load on the user's browser, ensuring a smoother experience[cite: 1].

## 3. Styling: CSS-First Architecture
* **Guideline:** Prioritize **native CSS** (Flexbox, Grid, etc.) for layout and styling over JavaScript-based logic[cite: 1].
* **Reasoning:** CSS is hardware-accelerated and highly optimized by browsers. Only use JS for styling when CSS limitations are strictly reached[cite: 1].

## 4. Editor Integrity: Synchronized Components
* **Guideline:** The `<p9r-comp-sync>` tag in `configuration.html` **must always** contain at least one child element.
* **Constraint:** Never use an empty `<p9r-comp-sync></p9r-comp-sync>` tag.
* **Reasoning:** Empty tags for this specific component cause critical bugs within the editor environment.

## 5. Theme System & Global Variables
* **Guideline:** Components **must** use the following standardized global variables for visual consistency[cite: 1].
* **Custom Styles:** If a component requires a specific style not covered by the theme, it must be made **configurable** via the component's configuration (attributes or editor settings)[cite: 1]. Never hardcode values that should be user-adjustable[cite: 1].

### Available Theme Variables Reference

| Category | Variable Names |
| :--- | :--- |
| **Surfaces** | `--bg-base`, `--bg-surface`, `--bg-overlay`[cite: 1] |
| **Text** | `--text-main`, `--text-body`, `--text-muted`, `--text-label`[cite: 1] |
| **Borders** | `--border-default`, `--border-light`[cite: 1] |
| **Primary** | `--primary-base`, `--primary-muted`, `--primary-contrasted`, `--color-primary`[cite: 1] |
| **Secondary** | `--secondary-base`, `--secondary-muted`, `--secondary-contrasted`[cite: 1] |
| **Status (Danger)** | `--danger-base`, `--danger-muted`, `--danger-contrasted`[cite: 1] |
| **Status (Success)** | `--success-base`, `--success-muted`, `--success-contrasted`[cite: 1] |
| **Status (Info)** | `--info-base`, `--info-muted`, `--info-contrasted`[cite: 1] |
| **Status (Warning)** | `--warning-base`, `--warning-muted`, `--warning-contrasted`[cite: 1] |

## 6. Editor Integrity: Text Must Live in a Leaf `<span>`
* **Guideline:** Every text content **must** be wrapped in a `<span>`, and that `<span>` must contain **only** that text — no child elements, no nested `<span>`.
* **Constraint:** Never mix a raw text node with sibling elements inside the same parent. Never wrap a `<span>` inside another `<span>`.
* **Reasoning:** The inline editor anchors editable text to its parent `<span>`. A bare text node next to elements has no anchor → the editor breaks. A `<span>` that also contains elements is treated as a structural container, not text → its text becomes invisible to the editor.

### Pattern

| Position | Allowed contents |
| :--- | :--- |
| `<span>` | exactly **one text node** |
| Any other element | child elements **OR** a single `<span>` — never a raw text node alongside elements |

### Examples

❌ Raw text node next to an element (the canonical bug):
```html
<span>
    <svg>...</svg>
    Bonjour
</span>
```

❌ Raw text node directly under a non-`<span>` element:
```html
<button>
    <svg>...</svg>
    Bonjour
</button>
```

❌ `<span>` inside `<span>`:
```html
<span><span>Bonjour</span></span>
```

✅ Each element / text owns its slot, the `<span>` is a leaf:
```html
<button>
    <svg>...</svg>
    <span>Bonjour</span>
</button>
```

### Quick check before commit
Search every `template.html` and `configuration.html` for any line where text appears as a direct child of an element. If the parent isn't a `<span>` containing only that text, wrap it.

## 7. SVG Icons: inline + swap-safe

* **Guideline:** SVG icons that the end user can swap **must** live inline in `template.html` (not as `<img src=".svg">`) and use `<p9r-svg-sync>` for the picker. Icons that are part of the bloc's design (logo, ornament, fixed visuals) stay hardcoded — no sync element, no swap UI.
* **Reasoning:** `<img>` is opaque to CSS — `currentColor` and `fill` don't reach the SVG content. Inline SVG is the only way the bloc's theme variables can color the icon. The trade-off is that swapping an inline SVG works ONLY if the bloc author writes their CSS defensively.

### Author contract for swappable SVGs

When a bloc opts into `<p9r-svg-sync>`, the author commits to three rules:

1. **Color via cascade** — the bloc CSS sets `color: var(--something)` on a wrapper, the SVG uses `fill="currentColor"` (and/or `stroke="currentColor"`). Don't hardcode hex/oklch in the SVG.
2. **Size via the wrapper, not the SVG** — set `width`/`height` on a wrapping `<span class="icon">`, then `.icon svg { width: 100%; height: 100%; display: block }`. The new SVG's own `width`/`height` attributes are ignored.
3. **No internal selectors** — never `.icon path:nth-child(2)`, `#myCircle`, or any selector that targets SVG internals. The new SVG won't have the same structure.

### Pattern

`template.html`:
```html
<button class="cta">
    <span class="icon">
        <svg viewBox="0 0 24 24" fill="currentColor"><path d="…"/></svg>
    </span>
    <span>Click me</span>
</button>
```

`configuration.html`:
```html
<p9r-svg-sync target=".icon svg" label="Icon">
    <span>SVG icon</span>
</p9r-svg-sync>
```

`style.css`:
```css
.cta { color: var(--primary-base); }
.icon { width: 20px; display: inline-block; }
.icon svg { width: 100%; height: 100%; display: block; }
```

### What `<p9r-svg-sync>` does

- Resolves `target` relative to the bloc shadow → finds the `<svg>` to swap.
- On click, opens the Media Center filtered to images; only `.svg` files are accepted (others surface a clear error).
- Fetches the picked file, **sanitizes it** (whitelist of SVG tags, strips `<script>`, `on*` attributes, dangerous `href`s), and replaces the inline `<svg>` element.
- Preserves the target's `class` attribute so the bloc's CSS keeps matching.

### When NOT to use `<p9r-svg-sync>`

- The SVG is a logo/ornament fixed by design → leave it inline, no sync element, no preview in the editor.
- The user uploads arbitrary images (PNG, JPEG, SVG mixed) → use `<p9r-image-sync>` over an `<img>` tag instead. You lose `currentColor` styling but gain MIME flexibility.

## 8. Slots: empty in `template.html`, populated by `configuration.html`

* **Guideline:** A `<slot>` in `template.html` **must be empty**. No fallback content, no default text, no placeholder elements. Initial content for every slot is declared in `configuration.html` via `<p9r-comp-sync>`.
* **Constraint:** Never write `<slot name="x">Default</slot>` or `<slot>Click me</slot>` in a bloc template.
* **Reasoning:** Two sources of truth for slot content (template fallback + configuration sync) drift the moment the user removes a child via the editor — the fallback reappears unexpectedly. Keeping the template purely structural and the configuration purely content-defining means the editor sees one signal: "what the user actually placed in the slot". The sync layer also relies on the slot being empty to detect "user removed the only child" and surface the empty state correctly.

### Examples

❌ Default content inside the slot:
```html
<!-- template.html -->
<article>
    <slot name="title">My title</slot>
    <slot name="icon">⭐</slot>
    <slot></slot>
</article>
```

✅ Empty slots, content shipped via `<p9r-comp-sync>`:
```html
<!-- template.html -->
<article>
    <slot name="title"></slot>
    <slot name="icon"></slot>
    <slot></slot>
</article>
```

```html
<!-- configuration.html -->
<p9r-comp-sync slotTarget="title">
    <span>My title</span>
</p9r-comp-sync>
<p9r-comp-sync slotTarget="icon">
    <span>⭐</span>
</p9r-comp-sync>
<p9r-comp-sync>
    <span>Body content goes here.</span>
</p9r-comp-sync>
```

### Quick check before commit

Grep `template.html` for `<slot[^>]*>[^<]` (slot with non-empty content right after the opening tag) — every match is a violation.

## 9. Navigation: `<a href>` or `history.pushState` — never `location.*` mutations

* **Guideline:** Static navigation **must** use `<a href="/...">`. Conditional / post-async navigation (login → dashboard, multi-step form, search → results) **must** use `history.pushState` (and let your site-level router pick up the URL change). Never assign to `location.href`, never call `location.assign`/`location.replace`, never assign to `window.location`.
* **Constraint:** `Bloc.ts` and `BlocEditor.ts` must contain none of: `location.href = …`, `window.location.href = …`, `location.assign(...)`, `location.replace(...)`, `window.location = …`. The push-time `validateBloc` rejects these patterns.
* **Reasoning:** WebIDL marks every `Location` member as `[[LegacyUnforgeable]]` — browsers refuse runtime overrides. The editor intercepts `<a href>` clicks (capture-phase document listener) and `history.pushState/replaceState` (monkey-patch), but `location.*` mutations slip past entirely: a bloc that does `location.href = "/x"` navigates the user away mid-edit, losing unsaved work. SEO and a11y also benefit (crawlers + screen readers expect anchors).

### Pattern

❌ Direct `Location` mutation — bypasses the editor:
```ts
class MyBloc extends Component {
    private _onClick() { location.href = "/contact"; }
}
```

✅ Static link — markup, intercepted natively:
```html
<a href="/contact">Contact us</a>
```

✅ Conditional / async navigation — `pushState`, intercepted:
```ts
class MyBloc extends Component {
    private async _submit() {
        const res = await fetch("/api/auth/login", { method: "POST", body: ... });
        if (res.ok) {
            const { dashboardUrl } = await res.json();
            history.pushState({}, "", dashboardUrl);
            // Your SPA router (or full page reload via popstate listener) handles the rest.
        }
    }
}
```

### Caveat about `history.pushState`

`pushState` only updates the URL — it does NOT reload the page. If your site doesn't have an SPA router that listens for `popstate` / URL changes and re-fetches content, the user sees a stale page after the call. Two options:
- Wire a small site-level router that reads `location.pathname` on `popstate` and updates the visible content.
- Accept the limitation: in editor mode the popover lets the user jump to that page's editor anyway; in production follow up the pushState with the right SPA-side rendering.

Form submits (`<form action="/x">`) are a separate channel — not intercepted, not validated. Rare in CMS user content; if you reach for one, check whether `<a>` would suffice.