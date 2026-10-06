import { type FilterMap } from "../../core/interpolate";
import { CompiledTemplate } from "../../reactive/CompiledTemplate";
import { type MountedInPlaceRegion } from "../../reactive/MountedRegion";
import { type MountedRegion } from "../../reactive/MountedRegion";
import { type Scope } from "../../core/scope";
import { type CapturedSourceContent } from "./sourceContent";
import { sourceContext } from "./sourceContext";

export class SourceRenderer {
    private readonly bodyTemplate: CompiledTemplate | null;
    private bodyRegion: MountedRegion | null = null;
    private inPlaceRegion: MountedInPlaceRegion | null = null;
    private rendered: "none" | "body" = "none";
    private scope: Scope | null = null;

    constructor(
        private readonly el: Element,
        private readonly captured: CapturedSourceContent,
        private readonly filters: FilterMap,
        private readonly options: { inPlace?: boolean } = {},
    ) {
        this.bodyTemplate = options.inPlace ? null : CompiledTemplate.fromFragment(captured.body, filters);
    }

    body(scope: Scope): void {
        this.scope = scope;
        scope = { ...scope, vars: { ...sourceContext(this.el, scope.value), ...scope.vars } };
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

    refreshContext(): void {
        if (this.scope) {
            this.body(this.scope);
        }
    }

    template(): void {
        this.scope = null;
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
