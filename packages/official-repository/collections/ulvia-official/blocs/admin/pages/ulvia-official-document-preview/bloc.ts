import { BlocBehavior } from "@bernouy/cms-content/browser";

export class Bloc extends BlocBehavior {
    static get observedAttributes(): string[] {
        return ["document"];
    }

    private readonly frame: HTMLIFrameElement;

    constructor(root: HTMLElement) {
        super(root);
        this.frame = document.createElement("iframe");
        this.frame.setAttribute("part", "frame");
        this.frame.setAttribute("sandbox", "");
        this.frame.title = "Page document preview";
        const preview = this?.querySelector<HTMLElement>('[part="preview"]');
        if (!preview) {
            throw new Error("Missing document preview surface.");
        }
        preview.setAttribute("aria-label", "Page document preview");
        preview.append(this.frame);
        this.sync();
    }

    attributeChangedCallback(): void {
        this.sync();
    }

    private sync(): void {
        this.frame.srcdoc = this.getAttribute("document") ?? "";
    }
}
