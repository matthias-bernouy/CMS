import { type FilterMap } from "../core/interpolate";
import { prepareNetworkInertBindings } from "../core/networkBindings";
import { type Scope } from "../core/scope";
import { MountedInPlaceRegion, MountedRegion } from "./MountedRegion";
import { pathOwnedBySubmitSource, submitBoundary } from "./compiler/submitOwnership";
import { compileTemplatePlan } from "./compiler/templateCompiler";
import { instantiateSites } from "./templateInstantiation";
import type { CompileOptions, CompilePlan } from "./templatePlan";

export class CompiledTemplate {
    private constructor(
        private readonly authoredTemplate: DocumentFragment,
        private readonly executableTemplate: DocumentFragment,
        private readonly plan: CompilePlan,
        private readonly filters: FilterMap,
    ) {}

    static fromFragment(fragment: DocumentFragment, filters: FilterMap = {}): CompiledTemplate {
        return CompiledTemplate.fromTemplate(fragment, filters);
    }

    static fromTemplate(
        template: DocumentFragment,
        filters: FilterMap,
        options: CompileOptions = {},
    ): CompiledTemplate {
        const authoredTemplate = template.cloneNode(true) as DocumentFragment;
        const executableTemplate = template.cloneNode(true) as DocumentFragment;
        prepareNetworkInertBindings(executableTemplate);
        const plan = compileTemplatePlan(executableTemplate, filters, options, CompiledTemplate.fromTemplate);
        return new CompiledTemplate(authoredTemplate, executableTemplate, plan, filters);
    }

    static bindChildrenInPlace(parent: Element, scope: Scope, filters: FilterMap = {}): MountedInPlaceRegion {
        prepareNetworkInertBindings(parent);
        const doc = parent.ownerDocument ?? document;
        const template = doc.createDocumentFragment();
        for (const child of Array.from(parent.childNodes)) {
            template.appendChild(child.cloneNode(true));
        }
        const plan = compileTemplatePlan(template, filters, {}, CompiledTemplate.fromTemplate);
        // The parent read source already owns persistent boolean directives in a nested form.
        // Its interpolated attributes are consumed, but these directives remain in the light DOM.
        if (parent.parentElement?.closest("[cms-source]")) {
            const boundary = submitBoundary(parent);
            plan.attributes = plan.attributes.filter(
                (item) => !item.boolean || pathOwnedBySubmitSource(item.template, boundary),
            );
        }
        const region = new MountedInPlaceRegion(instantiateSites(parent, plan, filters));
        region.update(scope);
        return region;
    }

    mount(parent: Node, scope: Scope, before: Node | null = null): MountedRegion {
        const doc = parent.ownerDocument ?? document;
        const start = doc.createComment("cms-region start");
        const end = doc.createComment("cms-region end");
        const instance = this.executableTemplate.cloneNode(true) as DocumentFragment;
        const region = new MountedRegion(start, end, instantiateSites(instance, this.plan, this.filters));

        // Resolve attributes before observers can discover the inserted nodes.
        region.update(scope);
        parent.insertBefore(start, before);
        parent.insertBefore(instance, before);
        parent.insertBefore(end, before);
        return region;
    }

    cloneRaw(): DocumentFragment {
        return this.authoredTemplate.cloneNode(true) as DocumentFragment;
    }
}
