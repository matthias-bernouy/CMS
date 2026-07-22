import {
    CMS_BINDING_ATTRIBUTES,
    parseSource,
    sourceStatusConditionsFromElement,
    type DataScope,
} from "@bernouy/cms-content/editor";
import { conditionFieldOptions } from "../../../../Pickers/ConditionPicker/Modes/fieldOptions";
import type {
    ConditionPickerCondition,
    ConditionPickerSource,
} from "../../../../Pickers/ConditionPicker/ConditionPicker";
import type { EditorStructureNode } from "../../../../../../runtime";
import type { StructureTreeController } from "../structureTreeController";

export function structureConditionPickerOptions(tree: StructureTreeController, node: EditorStructureNode) {
    return {
        sources: conditionSources(tree, node),
        selected: selectedConditions(tree, node),
        fields: conditionFieldOptions(dataScopes(tree, node)),
        expression: customConditionExpression(node),
        contextLabel: node.label,
        canRemove: node.target.hasAttribute(CMS_BINDING_ATTRIBUTES.condition),
    };
}

function conditionSources(tree: StructureTreeController, node: EditorStructureNode): ConditionPickerSource[] {
    return tree.nodes
        .sourceAncestorNodes(node)
        .filter((source) => tree.nodes.canSetSourceStatusCondition(node, source))
        .map((source) => ({
            editor: source.editor,
            label: source.label,
            sourceName: sourceName(tree, source),
        }));
}

function selectedConditions(tree: StructureTreeController, node: EditorStructureNode): ConditionPickerCondition[] {
    const sources = tree.nodes.sourceAncestorNodes(node);
    const selected: ConditionPickerCondition[] = [];
    for (const condition of tree.nodes.sourceStatusConditions(node)) {
        const source = condition.sourceId
            ? sources.find(
                  (candidate) => candidate.target.getAttribute(CMS_BINDING_ATTRIBUTES.sourceId) === condition.sourceId,
              )
            : sources[0];
        if (source) {
            selected.push({ sourceEditor: source.editor, sourceState: condition.state });
        }
    }
    return selected;
}

function sourceName(tree: StructureTreeController, source: EditorStructureNode): string | undefined {
    const binding = parseSource(source.target.getAttribute(CMS_BINDING_ATTRIBUTES.source) ?? "");
    if (!binding) {
        return undefined;
    }
    const dataSource = tree.state.dataSources.find((candidate) => sourceUrlMatchesBinding(candidate.url, binding.url));
    return dataSource?.label ?? binding.alias ?? binding.url;
}

function dataScopes(tree: StructureTreeController, node: EditorStructureNode): DataScope[] {
    const nodes: EditorStructureNode[] = [];
    for (let current: EditorStructureNode | null = node; current; current = tree.nodes.parentNode(current)) {
        nodes.unshift(current);
    }
    return nodes.flatMap((candidate) => candidate.editor.getDataScopes());
}

function customConditionExpression(node: EditorStructureNode): string {
    const value = node.target.getAttribute(CMS_BINDING_ATTRIBUTES.condition)?.trim() ?? "";
    return value && sourceStatusConditionsFromElement(node.target).length === 0 ? value : "";
}

function sourceUrlMatchesBinding(sourceUrl: string, bindingUrl: string): boolean {
    return (
        bindingUrl === sourceUrl ||
        bindingUrl.startsWith(`${sourceUrl}?`) ||
        (sourceUrl.includes("?") && bindingUrl.startsWith(`${sourceUrl}&`))
    );
}
