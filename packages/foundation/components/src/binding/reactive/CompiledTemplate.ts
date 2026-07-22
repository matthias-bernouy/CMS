import { type FilterMap } from "../core/interpolate";
import { type Scope } from "../core/scope";
import { MountedInPlaceRegion, MountedRegion } from "./MountedRegion";
import { compileTemplatePlan } from "./compiler/templateCompiler";
import { instantiateSites } from "./templateInstantiation";
import type { CompileOptions, CompilePlan } from "./templatePlan";

export class CompiledTemplate {
    private constructor(
        private readonly template: DocumentFragment,
        private readonly plan: CompilePlan,
        private readonly filters: FilterMap,
    ) {}

    static fromFragment(fragment: DocumentFragment, filters: FilterMap = {}): CompiledTemplate {
        const template = fragment.cloneNode(true) as DocumentFragment;
        return CompiledTemplate.fromTemplate(template, filters);
    }

    static fromTemplate(
        template: DocumentFragment,
        filters: FilterMap,
        options: CompileOptions = {},
    ): CompiledTemplate {
        const plan = compileTemplatePlan(template, filters, options, CompiledTemplate.fromTemplate);
        return new CompiledTemplate(template, plan, filters);
    }

    static bindChildrenInPlace(parent: Element, scope: Scope, filters: FilterMap = {}): MountedInPlaceRegion {
        const doc = parent.ownerDocument ?? document;
        const template = doc.createDocumentFragment();
        for (const child of Array.from(parent.childNodes)) {
            template.appendChild(child.cloneNode(true));
        }
        const plan = compileTemplatePlan(template, filters, {}, CompiledTemplate.fromTemplate);
        const region = new MountedInPlaceRegion(instantiateSites(parent, plan, filters));
        region.update(scope);
        return region;
    }

    mount(parent: Node, scope: Scope, before: Node | null = null): MountedRegion {
        const doc = parent.ownerDocument ?? document;
        const start = doc.createComment("cms-region start");
        const end = doc.createComment("cms-region end");
        const instance = this.template.cloneNode(true) as DocumentFragment;
        const region = new MountedRegion(start, end, instantiateSites(instance, this.plan, this.filters));

        // Resolve attributes before observers can discover the inserted nodes.
        region.update(scope);
        parent.insertBefore(start, before);
        parent.insertBefore(instance, before);
        parent.insertBefore(end, before);
        return region;
    }

    cloneRaw(): DocumentFragment {
        return this.template.cloneNode(true) as DocumentFragment;
    }
}
