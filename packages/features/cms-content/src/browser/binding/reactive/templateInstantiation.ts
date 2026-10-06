import type { FilterMap } from "../core/interpolate";
import type { LiveBindingSite } from "./MountedRegion";
import { AttributeSite, ConditionSite, RawHtmlSite, RepeatSite, TextSite } from "./templateSites";
import type { CompilePlan, NodePath } from "./templatePlan";

export function instantiateSites(root: Node, plan: CompilePlan, filters: FilterMap): LiveBindingSite[] {
    const sites: LiveBindingSite[] = [];
    const controlSites: LiveBindingSite[] = [];
    // Resolve every path before structural sites replace nodes with anchors.
    const textTargets = plan.text.map((item) => ({ item, node: nodeAtPath(root, item.path) }));
    const attributeTargets = plan.attributes.map((item) => ({ item, node: nodeAtPath(root, item.path) }));
    const conditionTargets = plan.conditions.map((item) => ({ item, node: nodeAtPath(root, item.path) }));
    const repeatTargets = plan.repeats.map((item) => ({ item, node: nodeAtPath(root, item.path) }));
    const rawHtmlTargets = plan.rawHtml.map((item) => ({ item, node: nodeAtPath(root, item.path) }));

    for (const { item: text, node } of textTargets) {
        if (node.nodeType !== Node.TEXT_NODE) {
            throw new Error("Compiled text binding no longer points to a text node.");
        }
        sites.push(new TextSite(node as Text, text.template, filters));
    }
    for (const { item: attribute, node } of attributeTargets) {
        if (node.nodeType !== Node.ELEMENT_NODE) {
            throw new Error("Compiled attribute binding no longer points to an element.");
        }
        const target =
            attribute.name === "value" || (attribute.boolean && attribute.name === "checked") ? controlSites : sites;
        target.push(new AttributeSite(node as Element, attribute.name, attribute.template, filters, attribute.boolean));
    }
    for (const { item: condition, node } of conditionTargets) {
        const range = replaceWithAnchors(node, "cms-condition");
        sites.push(new ConditionSite(range.start, range.end, condition.condition, condition.template));
    }
    for (const { item: repeat, node } of repeatTargets) {
        const range = replaceWithAnchors(node, `cms-repeat ${repeat.spec.path}`);
        sites.push(new RepeatSite(range.start, range.end, repeat.spec, repeat.template, repeat.rootCondition));
    }
    for (const { item: rawHtml, node } of rawHtmlTargets) {
        const range = replaceWithAnchors(node, `cms-html ${rawHtml.expression}`);
        sites.push(new RawHtmlSite(range.start, range.end, rawHtml.expression));
    }
    // Native selects receive their value after repeated/conditional options are mounted.
    return [...sites, ...controlSites];
}

function nodeAtPath(root: Node, path: NodePath): Node {
    let node = root;
    for (const index of path) {
        const child = node.childNodes.item(index);
        if (!child) {
            throw new Error(`Compiled binding path is invalid: ${path.join(".")}`);
        }
        node = child;
    }
    return node;
}

function replaceWithAnchors(node: Node, label: string): { start: Comment; end: Comment } {
    const parent = node.parentNode;
    if (!parent) {
        throw new Error(`Cannot mount ${label}: target node has no parent.`);
    }
    const doc = node.ownerDocument ?? document;
    const start = doc.createComment(`${label} start`);
    const end = doc.createComment(`${label} end`);
    parent.replaceChild(end, node);
    parent.insertBefore(start, end);
    return { start, end };
}
