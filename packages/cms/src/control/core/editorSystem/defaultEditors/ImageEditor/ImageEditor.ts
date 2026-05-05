import type { MediaCenter } from "src/control/components/editor/MediaCenter/MediaCenter";
import { Editor } from "../../Editor/Editor";
import { ResizeInstance } from "./ResizeInstance";

const cssStyle = `
    img:hover {
        opacity: 0.5;
        cursor: nwse-resize;
    }
`

export class ImageEditor extends Editor {

    private _mediaCenter: MediaCenter | null = null;
    private resizeInstance: ResizeInstance;

    private onClick = (e: MouseEvent) => this.handleClick(e);
    private onSelectMedia = (e: any) => this.handleSelectMedia(e);

    constructor(target: HTMLElement) {
        super(target, cssStyle);
        if (!this.target.getAttribute("src")) this.target.setAttribute("src", "https://picsum.photos/200");
        this.resizeInstance = new ResizeInstance(this.target, (w, h) => {
            this.target.style.width = `${w}px`;
            this.target.style.height = `${h}px`;
        });
    }

    init() {
        this.target.removeEventListener("click", this.onClick);
        this.target.addEventListener("click", this.onClick);

        const insideComponent = this.target.parentElement?.closest(`[${p9r.attr.EDITOR.IS_EDITOR}]`);
        const allowResize = !insideComponent || this.target.hasAttribute(p9r.attr.ACTION.ALLOW_RESIZE_IMAGE);
        if (allowResize) this.resizeInstance.start();
    }

    private handleSelectMedia(e: any) {
        this.target.setAttribute("src", e.detail.src);
        this.target.setAttribute("alt", e.detail.alt);
        this._mediaCenter?.removeEventListener("select-item", this.onSelectMedia)
        this._mediaCenter?.remove();
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
        })
        
    }

    restore() {
        this.target.removeEventListener("click", this.onClick);
        this._mediaCenter?.removeEventListener("select-item", this.onSelectMedia)
        this._mediaCenter?.remove();
        this.resizeInstance.stop();
    }
}