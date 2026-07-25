import { interpolateString, type FilterMap } from "../core/interpolate";
import { prepareNetworkInertBindings } from "../core/networkBindings";
import { lookup, type Scope } from "../core/scope";
import type { CompiledCondition } from "../render/condition";
import type { RepeatSpec } from "../render/repeat";
import { clearBetween, type LiveBindingSite, type MountedRegion } from "./MountedRegion";
import type { MountableTemplate } from "./templatePlan";

export class TextSite implements LiveBindingSite {
    constructor(
        private readonly node: Text,
        private readonly template: string,
        private readonly filters: FilterMap,
    ) {}
    update(scope: Scope): void {
        this.node.nodeValue = interpolateString(this.template, scope, this.filters);
    }
}

export class AttributeSite implements LiveBindingSite {
    constructor(
        private readonly element: Element,
        private readonly name: string,
        private readonly template: string,
        private readonly filters: FilterMap,
    ) {}
    update(scope: Scope): void {
        this.element.setAttribute(this.name, interpolateString(this.template, scope, this.filters));
    }
}

export class ConditionSite implements LiveBindingSite {
    private child: MountedRegion | null = null;
    constructor(
        private readonly start: Comment,
        private readonly end: Comment,
        private readonly condition: CompiledCondition,
        private readonly template: MountableTemplate,
    ) {}
    update(scope: Scope): void {
        if (!this.condition.evaluate(scope)) {
            this.unmount();
            return;
        }
        if (this.child) {
            this.child.update(scope);
            return;
        }
        const parent = this.end.parentNode;
        if (parent) {
            this.child = this.template.mount(parent, scope, this.end);
        }
    }
    unmount(): void {
        this.child?.unmount();
        this.child = null;
        clearBetween(this.start, this.end);
    }
}

export class RepeatSite implements LiveBindingSite {
    private regions: MountedRegion[] = [];
    constructor(
        private readonly start: Comment,
        private readonly end: Comment,
        private readonly spec: RepeatSpec,
        private readonly template: MountableTemplate,
        private readonly rootCondition: CompiledCondition | null,
    ) {}
    update(scope: Scope): void {
        this.unmount();
        const result = lookup(scope, this.spec.path);
        if (!Array.isArray(result.value)) {
            if (result.found && result.value != null) {
                console.warn(`cms-repeat="${this.spec.path}" expected an array, got`, result.value);
            }
            return;
        }
        const parent = this.end.parentNode;
        if (!parent) {
            return;
        }
        for (const item of result.value) {
            const childScope: Scope = this.spec.name
                ? { vars: { [this.spec.name]: item }, parent: scope }
                : { value: item, parent: scope };
            if (!this.rootCondition || this.rootCondition.evaluate(childScope)) {
                this.regions.push(this.template.mount(parent, childScope, this.end));
            }
        }
    }
    unmount(): void {
        for (const region of this.regions) {
            region.unmount();
        }
        this.regions = [];
        clearBetween(this.start, this.end);
    }
}

export class RawHtmlSite implements LiveBindingSite {
    constructor(
        private readonly start: Comment,
        private readonly end: Comment,
        private readonly expression: string,
    ) {}
    update(scope: Scope): void {
        clearBetween(this.start, this.end);
        const parent = this.end.parentNode;
        if (!parent) {
            return;
        }
        const result = lookup(scope, this.expression);
        const template = (this.end.ownerDocument ?? document).createElement("template");
        template.innerHTML = result.found && result.value != null ? String(result.value) : "";
        prepareNetworkInertBindings(template.content);
        parent.insertBefore(template.content, this.end);
    }
    unmount(): void {
        clearBetween(this.start, this.end);
    }
}
