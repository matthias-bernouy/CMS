import { type FilterMap } from "../interpolate";
import { CompiledTemplate } from "../reactive/CompiledTemplate";
import { type MountedRegion } from "../reactive/MountedRegion";
import { type Scope } from "../scope";
import { type CapturedSourceContent } from "./sourceContent";

export class SourceRenderer {
    private readonly bodyTemplate: CompiledTemplate;
    private bodyRegion: MountedRegion | null = null;
    private rendered: "none" | "body" = "none";

    constructor(
        private readonly el: Element,
        private readonly captured: CapturedSourceContent,
        private readonly filters: FilterMap,
    ) {
        this.bodyTemplate = CompiledTemplate.fromFragment(captured.body, filters);
    }

    body(scope: Scope): void {
        if (this.bodyRegion && this.rendered === "body") {
            this.bodyRegion.update(scope);
            return;
        }
        this.clear();
        this.bodyRegion = this.bodyTemplate.mount(this.el, scope);
        this.rendered = "body";
    }

    template(): void {
        this.clear();
        this.el.replaceChildren(this.captured.template.cloneNode(true));
    }

    clear(): void {
        this.bodyRegion?.unmount();
        this.bodyRegion = null;
        this.el.replaceChildren();
        this.rendered = "none";
    }
}
