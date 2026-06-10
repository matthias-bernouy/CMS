import type { MediaCenter } from "cms-control/components/editor/MediaCenter/MediaCenter";
import { sanitizeSvg } from "cms-control/components/editor/componentSync/sync/SvgSync/sanitize";
import { Editor } from "../Editor/Editor";

const cssStyle = `
    svg:hover {
        opacity: 0.5;
        cursor: pointer;
    }
`;

/**
 * Default editor for any inline `<svg>` found in editable content. Same swap
 * behaviour as `<p9r-svg-sync>` (open Media Center → SVG-only filter → fetch
 * → sanitize → replace), but auto-attached without requiring the bloc author
 * to wire a sync element. This is the safety net for blocs that drop an
 * `<svg>` straight into editable markup (or wrap it in `<p9r-comp-sync>`
 * incorrectly) — we still let the end user swap it.
 *
 * No preview surfaces in the config panel (only `<p9r-svg-sync>` does that);
 * interaction is purely "click the SVG → picker opens".
 */
export class SvgEditor extends Editor {

    private _mediaCenter: MediaCenter | null = null;
    private onClick        = (e: MouseEvent) => this.handleClick(e);
    private onSelectMedia  = (e: Event) => this.handleSelectMedia(e);

    constructor(target: SVGElement) {
        super(target as unknown as HTMLElement, cssStyle);
    }

    init() {
        this.target.removeEventListener("click", this.onClick);
        this.target.addEventListener("click", this.onClick);
    }

    restore() {
        this.target.removeEventListener("click", this.onClick);
        this._mediaCenter?.removeEventListener("select-item", this.onSelectMedia);
        this._mediaCenter?.remove();
        this._mediaCenter = null;
    }

    private handleClick(e: MouseEvent) {
        e.preventDefault();
        e.stopImmediatePropagation();

        const mediaCenter = document.createElement("cms-media-center") as MediaCenter;
        document.body.append(mediaCenter);

        requestAnimationFrame(() => {
            this._mediaCenter = mediaCenter;
            mediaCenter.removeEventListener("select-item", this.onSelectMedia);
            mediaCenter.addEventListener("select-item", this.onSelectMedia);
            mediaCenter.show(["folder", "image"]);
        });
    }

    private async handleSelectMedia(e: Event) {
        const src = (e as CustomEvent).detail?.src as string | undefined;
        const mimetype = (e as CustomEvent).detail?.mimetype as string | undefined;
        this._mediaCenter?.removeEventListener("select-item", this.onSelectMedia);
        this._mediaCenter?.remove();
        this._mediaCenter = null;

        // Gate on the real mime type, not the URL — id URLs carry no `.svg`.
        if (!src || mimetype !== "image/svg+xml") return;

        try {
            const svgText = await fetch(src).then(r => r.text());
            const cleaned = sanitizeSvg(svgText);
            const parsed  = new DOMParser().parseFromString(cleaned, "image/svg+xml");
            const fresh   = parsed.documentElement;
            if (!(fresh instanceof SVGElement)) return;

            // Preserve the original SVG's class attribute so any external
            // CSS targeting it keeps matching after the swap.
            const cls = this.target.getAttribute("class");
            if (cls) fresh.setAttribute("class", cls);

            this.target.replaceWith(fresh);
            this.target = fresh as unknown as HTMLElement;
        } catch {
            // Sanitizer rejected the input; nothing to swap. The user gets
            // no UI feedback here — an explicit error surface lives on the
            // `<p9r-svg-sync>` config widget when the bloc author opted in.
        }
    }
}
