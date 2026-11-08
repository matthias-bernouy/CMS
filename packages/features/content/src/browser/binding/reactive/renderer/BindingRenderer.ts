import { type FilterMap } from "../../core/interpolate";
import { type Scope } from "../../core/scope";
import { CompiledTemplate } from "../CompiledTemplate";
import { type MountedInPlaceRegion, type MountedRegion } from "../MountedRegion";
import { type CapturedBindingContent } from "./bindingContent";

export class BindingRenderer {
    private readonly bodyTemplate: CompiledTemplate | null;
    private bodyRegion: MountedRegion | null = null;
    private inPlaceRegion: MountedInPlaceRegion | null = null;
    private rendered: "none" | "body" = "none";

    constructor(
        private readonly el: Element,
        private readonly captured: CapturedBindingContent,
        private readonly filters: FilterMap,
        private readonly options: { inPlace?: boolean } = {},
    ) {
        this.bodyTemplate = options.inPlace ? null : CompiledTemplate.fromFragment(captured.body, filters);
    }

    body(scope: Scope): void {
        if (this.options.inPlace) {
            if (!this.inPlaceRegion) {
                this.inPlaceRegion = CompiledTemplate.bindChildrenInPlace(this.el, scope, this.filters);
                this.rendered = "body";
                return;
            }
            this.inPlaceRegion.update(scope);
            return;
        }

        if (this.bodyRegion && this.rendered === "body") {
            this.bodyRegion.update(scope);
            return;
        }
        this.clear();
        this.bodyRegion = this.bodyTemplate!.mount(this.el, scope);
        this.rendered = "body";
    }

    template(): void {
        this.inPlaceRegion?.unmount();
        this.inPlaceRegion = null;
        this.clear();
        this.el.replaceChildren(this.captured.template.cloneNode(true));
    }

    clear(): void {
        if (this.options.inPlace) {
            return;
        }
        this.bodyRegion?.unmount();
        this.bodyRegion = null;
        this.el.replaceChildren();
        this.rendered = "none";
    }
}
