import {
    CMS_BINDING_ATTRIBUTES,
    isCmsSourceTrigger,
    parseSource,
    parseSourceBody,
} from "@bernouy/cms-content/editor";
import type { EditorStructureNode } from "../../../../runtime";
import type { EditorDataSource } from "../../../../runtime";
import {
    DATA_SOURCE_PICKER_REMOVE_EVENT,
    DATA_SOURCE_PICKER_SELECT_EVENT,
    type DataSourcePicker,
    type DataSourcePickerSourceBinding,
} from "../../DataSourcePicker/DataSourcePicker";

export type StructureSourcePickerContext = {
    dataSources: EditorDataSource[];
    onRemove: EventListener;
    onSelect: EventListener;
    picker: DataSourcePicker;
    setPendingSourceEditor(editor: EditorStructureNode["editor"]): void;
};

export function openStructureSourcePicker(node: EditorStructureNode, context: StructureSourcePickerContext): void {
    context.setPendingSourceEditor(node.editor);
    const { picker } = context;
    picker.removeEventListener(DATA_SOURCE_PICKER_SELECT_EVENT, context.onSelect);
    picker.removeEventListener(DATA_SOURCE_PICKER_REMOVE_EVENT, context.onRemove);
    picker.addEventListener(DATA_SOURCE_PICKER_SELECT_EVENT, context.onSelect);
    picker.addEventListener(DATA_SOURCE_PICKER_REMOVE_EVENT, context.onRemove);
    picker.open(context.dataSources, node.label, {
        canRemove:      node.target.hasAttribute(CMS_BINDING_ATTRIBUTES.source),
        initialBinding: sourceBindingForNode(node),
    });
}

export function sourceBindingForNode(node: EditorStructureNode): DataSourcePickerSourceBinding | null {
    const source = parseSource(node.target.getAttribute(CMS_BINDING_ATTRIBUTES.source) ?? "");
    const body = parseSourceBody(node.target.getAttribute(CMS_BINDING_ATTRIBUTES.sourceBody));
    const trigger = node.target.getAttribute(CMS_BINDING_ATTRIBUTES.sourceTrigger);
    const method = node.target.getAttribute(CMS_BINDING_ATTRIBUTES.sourceMethod);
    return source
        ? {
            url: source.url,
            ...(source.alias ? { alias: source.alias } : {}),
            ...(method ? { method: method as DataSourcePickerSourceBinding["method"] } : {}),
            ...(body ? { body: body as DataSourcePickerSourceBinding["body"] } : {}),
            ...(isCmsSourceTrigger(trigger) && trigger !== "auto" ? { trigger } : {}),
        }
        : null;
}
