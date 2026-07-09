import { BINDING_CORE_TAG, CONDITION_ATTR, REPEAT_ATTR, SOURCE_ATTR, SOURCE_TRIGGER_ATTR } from "../attrs";
import { interpolateString, type FilterMap } from "../interpolate";
import { parseRepeat, type RepeatSpec } from "../render/repeat";
import { collectConditionReferences, compileCondition, type CompiledCondition } from "../render/condition";
import { lookup, type Scope } from "../scope";
import { clearBetween, MountedInPlaceRegion, MountedRegion, type LiveBindingSite } from "./MountedRegion";
import { parseSourceSpec } from "../source/sourceSpec";

type NodePath = number[];

type TextPlan = {
    path: NodePath;
    template: string;
};

type AttributePlan = {
    path: NodePath;
    name: string;
    template: string;
};

type ConditionPlan = {
    path: NodePath;
    condition: CompiledCondition;
    template: CompiledTemplate;
};

type RepeatPlan = {
    path: NodePath;
    spec: RepeatSpec;
    template: CompiledTemplate;
    rootCondition: CompiledCondition | null;
};

type RawHtmlPlan = {
    path: NodePath;
    expression: string;
};

type CompilePlan = {
    text: TextPlan[];
    attributes: AttributePlan[];
    conditions: ConditionPlan[];
    repeats: RepeatPlan[];
    rawHtml: RawHtmlPlan[];
};

type CompileOptions = {
    skipRootCondition?: boolean;
    skipRootRepeat?: boolean;
    submitBoundary?: SubmitSourceBoundary | null;
};

type SubmitSourceBoundary = {
    alias?: string;
};

export class CompiledTemplate {
    private constructor(
        private readonly template: DocumentFragment,
        private readonly plan: CompilePlan,
        private readonly filters: FilterMap,
    ) {}

    static fromFragment(fragment: DocumentFragment, filters: FilterMap = {}): CompiledTemplate {
        const template = fragment.cloneNode(true) as DocumentFragment;
        return new CompiledTemplate(template, compile(template, filters), filters);
    }

    mount(parent: Node, scope: Scope, before: Node | null = null): MountedRegion {
        const doc = parent.ownerDocument ?? document;
        const start = doc.createComment("cms-region start");
        const end = doc.createComment("cms-region end");
        const instance = this.template.cloneNode(true) as DocumentFragment;
        const sites = instantiateSites(instance, this.plan, this.filters);
        const region = new MountedRegion(start, end, sites);

        // Apply before insertion so nested source attributes are resolved before
        // a runtime observer can discover the mounted nodes.
        region.update(scope);
        parent.insertBefore(start, before);
        parent.insertBefore(instance, before);
        parent.insertBefore(end, before);
        return region;
    }

    cloneRaw(): DocumentFragment {
        return this.template.cloneNode(true) as DocumentFragment;
    }

    static fromTemplate(template: DocumentFragment, filters: FilterMap, options: CompileOptions = {}): CompiledTemplate {
        return new CompiledTemplate(template, compile(template, filters, options), filters);
    }

    static bindChildrenInPlace(parent: Element, scope: Scope, filters: FilterMap = {}): MountedInPlaceRegion {
        const doc = parent.ownerDocument ?? document;
        const template = doc.createDocumentFragment();
        for (const child of Array.from(parent.childNodes)) template.appendChild(child.cloneNode(true));
        const plan = compile(template, filters);
        const sites = instantiateSites(parent, plan, filters);
        const region = new MountedInPlaceRegion(sites);
        region.update(scope);
        return region;
    }
}

class TextSite implements LiveBindingSite {
    constructor(
        private readonly node: Text,
        private readonly template: string,
        private readonly filters: FilterMap,
    ) {}

    update(scope: Scope): void {
        this.node.nodeValue = interpolateString(this.template, scope, this.filters);
    }
}

class AttributeSite implements LiveBindingSite {
    constructor(
        private readonly el: Element,
        private readonly name: string,
        private readonly template: string,
        private readonly filters: FilterMap,
    ) {}

    update(scope: Scope): void {
        this.el.setAttribute(this.name, interpolateString(this.template, scope, this.filters));
    }
}

class ConditionSite implements LiveBindingSite {
    private child: MountedRegion | null = null;

    constructor(
        private readonly start: Comment,
        private readonly end: Comment,
        private readonly condition: CompiledCondition,
        private readonly template: CompiledTemplate,
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
        if (!parent) return;
        this.child = this.template.mount(parent, scope, this.end);
    }

    unmount(): void {
        this.child?.unmount();
        this.child = null;
        clearBetween(this.start, this.end);
    }
}

class RepeatSite implements LiveBindingSite {
    private regions: MountedRegion[] = [];

    constructor(
        private readonly start: Comment,
        private readonly end: Comment,
        private readonly spec: RepeatSpec,
        private readonly template: CompiledTemplate,
        private readonly rootCondition: CompiledCondition | null,
    ) {}

    update(scope: Scope): void {
        this.unmount();

        const res = lookup(scope, this.spec.path);
        if (!Array.isArray(res.value)) {
            if (res.found && res.value != null) {
                console.warn(`cms-repeat="${this.spec.path}" expected an array, got`, res.value);
            }
            return;
        }

        const parent = this.end.parentNode;
        if (!parent) return;

        for (const item of res.value) {
            const childScope: Scope = this.spec.name
                ? { vars: { [this.spec.name]: item }, parent: scope }
                : { value: item, parent: scope };
            if (this.rootCondition && !this.rootCondition.evaluate(childScope)) continue;
            this.regions.push(this.template.mount(parent, childScope, this.end));
        }
    }

    unmount(): void {
        for (const region of this.regions) region.unmount();
        this.regions = [];
        clearBetween(this.start, this.end);
    }
}

class RawHtmlSite implements LiveBindingSite {
    constructor(
        private readonly start: Comment,
        private readonly end: Comment,
        private readonly expression: string,
    ) {}

    update(scope: Scope): void {
        clearBetween(this.start, this.end);

        const parent = this.end.parentNode;
        if (!parent) return;

        const res = lookup(scope, this.expression);
        const tpl = (this.end.ownerDocument ?? document).createElement("template");
        tpl.innerHTML = res.found && res.value != null ? String(res.value) : "";
        parent.insertBefore(tpl.content, this.end);
    }

    unmount(): void {
        clearBetween(this.start, this.end);
    }
}

function compile(fragment: DocumentFragment, filters: FilterMap, options: CompileOptions = {}): CompilePlan {
    const plan: CompilePlan = { text: [], attributes: [], conditions: [], repeats: [], rawHtml: [] };
    Array.from(fragment.childNodes).forEach((child, index) => {
        compileNode(child, [index], {
            skipCondition: options.skipRootCondition === true,
            skipRepeat: options.skipRootRepeat === true,
            submitBoundary: options.submitBoundary ?? null,
        }, plan, filters);
    });
    return plan;
}

function compileNode(
    node: Node,
    path: NodePath,
    options: { skipCondition: boolean; skipRepeat: boolean; submitBoundary: SubmitSourceBoundary | null },
    plan: CompilePlan,
    filters: FilterMap,
): void {
    if (node.nodeType === Node.TEXT_NODE) {
        const template = node.nodeValue ?? "";
        if (hasBinding(template) && !bindingOwnedBySubmitSource(template, options.submitBoundary)) plan.text.push({ path, template });
        return;
    }

    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as Element;

    if (!options.skipRepeat && el.hasAttribute(REPEAT_ATTR) && !pathOwnedBySubmitSource(el.getAttribute(REPEAT_ATTR) ?? "", options.submitBoundary)) {
        const rootCondition = el.getAttribute(CONDITION_ATTR);
        const rootConditionOwnedBySubmit = rootCondition
            ? conditionOwnedBySubmitSource(rootCondition, options.submitBoundary)
            : false;
        plan.repeats.push({
            path,
            spec: parseRepeat(el.getAttribute(REPEAT_ATTR) ?? ""),
            template: compileElementTemplate(el, filters, {
                removeRepeat: true,
                removeCondition: !!options.submitBoundary && !!rootCondition && !rootConditionOwnedBySubmit,
                submitBoundary: options.submitBoundary,
            }),
            rootCondition: rootConditionOwnedBySubmit || !rootCondition ? null : compileCondition(rootCondition),
        });
        return;
    }

    if (!options.skipCondition && el.hasAttribute(CONDITION_ATTR) && !conditionOwnedBySubmitSource(el.getAttribute(CONDITION_ATTR) ?? "", options.submitBoundary)) {
        plan.conditions.push({
            path,
            condition: compileCondition(el.getAttribute(CONDITION_ATTR) ?? ""),
            template: compileElementTemplate(el, filters, {
                removeCondition: !!options.submitBoundary,
                submitBoundary: options.submitBoundary,
            }),
        });
        return;
    }

    if (el.hasAttribute(SOURCE_ATTR)) {
        compileAttributes(el, path, plan, options.submitBoundary);
        if (el.getAttribute(SOURCE_TRIGGER_ATTR)?.trim().toLowerCase() !== "submit") return;
        const nextBoundary = submitBoundary(el);
        Array.from(el.childNodes).forEach((child, index) => {
            compileNode(child, [...path, index], { skipCondition: false, skipRepeat: false, submitBoundary: nextBoundary }, plan, filters);
        });
        return;
    }

    if (el.localName === BINDING_CORE_TAG) {
        compileAttributes(el, path, plan, options.submitBoundary);
        return;
    }

    const rawHtml = rawHtmlExpression(el);
    if (rawHtml) {
        if (!pathOwnedBySubmitSource(rawHtml, options.submitBoundary)) plan.rawHtml.push({ path, expression: rawHtml });
        return;
    }

    compileAttributes(el, path, plan, options.submitBoundary);

    Array.from(el.childNodes).forEach((child, index) => {
        compileNode(child, [...path, index], { skipCondition: false, skipRepeat: false, submitBoundary: options.submitBoundary }, plan, filters);
    });
}

function instantiateSites(root: Node, plan: CompilePlan, filters: FilterMap): LiveBindingSite[] {
    const sites: LiveBindingSite[] = [];
    const textTargets = plan.text.map((text) => ({ plan: text, node: nodeAtPath(root, text.path) }));
    const attrTargets = plan.attributes.map((attr) => ({ plan: attr, node: nodeAtPath(root, attr.path) }));
    const conditionTargets = plan.conditions.map((condition) => ({ plan: condition, node: nodeAtPath(root, condition.path) }));
    const repeatTargets = plan.repeats.map((repeat) => ({ plan: repeat, node: nodeAtPath(root, repeat.path) }));
    const rawHtmlTargets = plan.rawHtml.map((rawHtml) => ({ plan: rawHtml, node: nodeAtPath(root, rawHtml.path) }));

    for (const { plan: text, node } of textTargets) {
        if (node.nodeType !== Node.TEXT_NODE) throw new Error("Compiled text binding no longer points to a text node.");
        sites.push(new TextSite(node as Text, text.template, filters));
    }

    for (const { plan: attr, node } of attrTargets) {
        if (node.nodeType !== Node.ELEMENT_NODE) throw new Error("Compiled attribute binding no longer points to an element.");
        sites.push(new AttributeSite(node as Element, attr.name, attr.template, filters));
    }

    for (const { plan: condition, node } of conditionTargets) {
        const range = replaceWithAnchors(node, "cms-condition");
        sites.push(new ConditionSite(range.start, range.end, condition.condition, condition.template));
    }

    for (const { plan: repeat, node } of repeatTargets) {
        const range = replaceWithAnchors(node, `cms-repeat ${repeat.spec.path}`);
        sites.push(new RepeatSite(range.start, range.end, repeat.spec, repeat.template, repeat.rootCondition));
    }

    for (const { plan: rawHtml, node } of rawHtmlTargets) {
        const range = replaceWithAnchors(node, `cms-html ${rawHtml.expression}`);
        sites.push(new RawHtmlSite(range.start, range.end, rawHtml.expression));
    }

    return sites;
}

function nodeAtPath(root: Node, path: NodePath): Node {
    let node: Node = root;
    for (const index of path) {
        const child = node.childNodes.item(index);
        if (!child) throw new Error(`Compiled binding path is invalid: ${path.join(".")}`);
        node = child;
    }
    return node;
}

function hasBinding(value: string): boolean {
    return value.includes("{{");
}

function compileAttributes(el: Element, path: NodePath, plan: CompilePlan, boundary: SubmitSourceBoundary | null = null): void {
    for (const attr of Array.from(el.attributes)) {
        if (hasBinding(attr.value) && !bindingOwnedBySubmitSource(attr.value, boundary)) {
            plan.attributes.push({ path, name: attr.name, template: attr.value });
        }
    }
}

function compileElementTemplate(
    el: Element,
    filters: FilterMap,
    options: { removeRepeat?: boolean; removeCondition?: boolean; submitBoundary?: SubmitSourceBoundary | null } = {},
): CompiledTemplate {
    const fragment = (el.ownerDocument ?? document).createDocumentFragment();
    const clone = el.cloneNode(true) as Element;
    if (options.removeRepeat) clone.removeAttribute(REPEAT_ATTR);
    if (options.removeCondition) clone.removeAttribute(CONDITION_ATTR);
    fragment.appendChild(clone);
    return CompiledTemplate.fromTemplate(fragment, filters, {
        skipRootCondition: true,
        skipRootRepeat: options.removeRepeat === true,
        submitBoundary: options.submitBoundary ?? null,
    });
}

function replaceWithAnchors(node: Node, label: string): { start: Comment; end: Comment } {
    const parent = node.parentNode;
    if (!parent) throw new Error(`Cannot mount ${label}: target node has no parent.`);

    const doc = node.ownerDocument ?? document;
    const start = doc.createComment(`${label} start`);
    const end = doc.createComment(`${label} end`);
    parent.replaceChild(end, node);
    parent.insertBefore(start, end);
    return { start, end };
}

const RAW_HTML = /^\{\{\s*([\w.]+)\s*\|\s*innerHTML\s*\}\}$/;
const BINDING_TOKEN = /\{\{\s*([\w$.-]+)(?:\s*\|\s*(\w+))?\s*\}\}/g;
function rawHtmlExpression(el: Element): string | null {
    if (el.childNodes.length !== 1) return null;
    const only = el.firstChild;
    if (!only || only.nodeType !== Node.TEXT_NODE) return null;
    return (only.nodeValue ?? "").trim().match(RAW_HTML)?.[1] ?? null;
}

function submitBoundary(el: Element): SubmitSourceBoundary {
    return { alias: parseSourceSpec(el.getAttribute(SOURCE_ATTR) ?? "").alias };
}

function bindingOwnedBySubmitSource(value: string, boundary: SubmitSourceBoundary | null): boolean {
    if (!boundary) return false;
    BINDING_TOKEN.lastIndex = 0;
    for (const match of value.matchAll(BINDING_TOKEN)) {
        if (pathOwnedBySubmitSource(match[1] ?? "", boundary)) return true;
    }
    return false;
}

function conditionOwnedBySubmitSource(value: string, boundary: SubmitSourceBoundary | null): boolean {
    if (!boundary) return false;
    for (const path of collectConditionReferences(value)) {
        if (pathOwnedBySubmitSource(path, boundary)) return true;
    }
    return false;
}

function pathOwnedBySubmitSource(path: string, boundary: SubmitSourceBoundary | null): boolean {
    if (!boundary) return false;
    const head = path.trim().split(".")[0] ?? "";
    return head === "$source" || (!!boundary.alias && head === boundary.alias);
}
