import { interpolateString, type FilterMap } from "../core/interpolate";
import { prepareNetworkInertBindings } from "../core/networkBindings";
import { lookup, type Scope } from "../core/scope";
import type { CompiledCondition } from "../render/condition";
import type { RepeatSpec } from "../render/repeat";
import { clearBetween, type LiveBindingSite, type MountedRegion } from "./MountedRegion";
import type { MountableTemplate } from "./templatePlan";
import { acknowledgesControl } from "../source/runtime/submission/acknowledgement";
import { applyControlAttribute } from "./controls/value";

export class TextSite implements LiveBindingSite {
    constructor(
        private readonly node: Text,
        private readonly template: string,
        private readonly filters: FilterMap,
    ) {}
    update(scope: Scope): void {
        const value = interpolateString(this.template, scope, this.filters);
        if (this.node.nodeValue !== value) {
            this.node.nodeValue = value;
        }
    }
}

export class AttributeSite implements LiveBindingSite {
    private revision = 0;
    private applied = false;
    private lastValue: string | boolean = "";
    constructor(
        private readonly element: Element,
        private readonly name: string,
        private readonly template: string,
        private readonly filters: FilterMap,
        private readonly boolean = false,
    ) {}
    update(scope: Scope): void {
        const next = this.boolean
            ? lookup(scope, this.template).value === true
            : interpolateString(this.template, scope, this.filters);
        if (this.applied && next === this.lastValue && !acknowledgesControl(this.element)) {
            return;
        }
        this.applied = true;
        this.lastValue = next;
        if (this.boolean) {
            const present = next === true;
            if (this.element.hasAttribute(this.name) !== present) {
                this.element.toggleAttribute(this.name, present);
            }
            this.applyControl(next);
            return;
        }
        const value = String(next);
        if (this.element.getAttribute(this.name) !== value) {
            this.element.setAttribute(this.name, value);
        }
        this.applyControl(next);
    }
    private applyControl(value: string | boolean): void {
        if (this.name !== "value" && !(this.boolean && ["checked", "selected"].includes(this.name))) {
            return;
        }
        const revision = ++this.revision;
        const apply = () => {
            if (revision === this.revision) {
                applyControlAttribute(this.element as HTMLElement, this.name, value);
            }
        };
        const registry = this.element.ownerDocument.defaultView?.customElements;
        if (registry && this.element.localName.includes("-") && !registry.get(this.element.localName)) {
            void registry.whenDefined(this.element.localName).then(apply);
        } else {
            registry?.upgrade(this.element);
            apply();
        }
    }
    unmount(): void {
        this.revision++;
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
    private entries: unknown[] = [];
    constructor(
        private readonly start: Comment,
        private readonly end: Comment,
        private readonly spec: RepeatSpec,
        private readonly template: MountableTemplate,
        private readonly rootCondition: CompiledCondition | null,
    ) {}
    update(scope: Scope): void {
        const values = this.values(scope);
        const visible = values?.filter(
            (item) => !this.rootCondition || this.rootCondition.evaluate(this.childScope(item, scope)),
        );
        const parent = this.end.parentNode;
        if (!visible || !parent) {
            this.unmount();
            return;
        }
        for (const region of this.regions.splice(visible.length)) {
            region.unmount();
        }
        let before: Node = this.end;
        for (let index = visible.length - 1; index >= 0; index--) {
            const item = visible[index];
            const childScope = this.childScope(item, scope);
            const region = this.regions[index];
            if (region && Object.is(item, this.entries[index])) {
                region.update(childScope);
            } else {
                region?.unmount();
                this.regions[index] = this.template.mount(parent, childScope, before);
            }
            before = this.regions[index]!.startNode;
        }
        this.entries = [...visible];
    }
    private childScope(item: unknown, parent: Scope): Scope {
        return this.spec.name ? { vars: { [this.spec.name]: item }, parent } : { value: item, parent };
    }
    private values(scope: Scope): unknown[] | null {
        if (this.spec.rangeError) {
            console.warn(`Invalid cms-repeat="${this.spec.path}": ${this.spec.rangeError}`);
            return null;
        }
        if (this.spec.rangeCount !== undefined) {
            return Array.from({ length: this.spec.rangeCount }, (_, index) => index);
        }
        const result = lookup(scope, this.spec.path);
        if (!Array.isArray(result.value)) {
            if (result.found && result.value != null) {
                console.warn(`cms-repeat="${this.spec.path}" expected an array, got`, result.value);
            }
            return null;
        }
        return result.value;
    }
    unmount(): void {
        for (const region of this.regions) {
            region.unmount();
        }
        this.regions = [];
        this.entries = [];
        clearBetween(this.start, this.end);
    }
}

export class RawHtmlSite implements LiveBindingSite {
    private previous: string | undefined;
    constructor(
        private readonly start: Comment,
        private readonly end: Comment,
        private readonly expression: string,
    ) {}
    update(scope: Scope): void {
        const result = lookup(scope, this.expression);
        const value = result.found && result.value != null ? String(result.value) : "";
        if (value === this.previous) {
            return;
        }
        this.previous = value;
        clearBetween(this.start, this.end);
        const parent = this.end.parentNode;
        if (!parent) {
            return;
        }
        const template = (this.end.ownerDocument ?? document).createElement("template");
        template.innerHTML = value;
        prepareNetworkInertBindings(template.content);
        parent.insertBefore(template.content, this.end);
    }
    unmount(): void {
        this.previous = undefined;
        clearBetween(this.start, this.end);
    }
}
