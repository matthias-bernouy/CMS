import { type FilterMap } from "../interpolate";
import { CompiledTemplate } from "../reactive/CompiledTemplate";
import { type MountedRegion } from "../reactive/MountedRegion";
import { renderContent, type Captured } from "../render/slots";
import { type Scope } from "../scope";

export class SourceRenderer {
    private readonly bodyTemplate: CompiledTemplate;
    private bodyRegion: MountedRegion | null = null;
    private rendered: "none" | "body" | "slot" = "none";

    constructor(
        private readonly el: Element,
        private readonly captured: Captured,
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

    slot(fragment: DocumentFragment, scope: Scope | null): void {
        this.clear();
        renderContent(this.el, fragment, scope, this.filters);
        this.rendered = "slot";
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
