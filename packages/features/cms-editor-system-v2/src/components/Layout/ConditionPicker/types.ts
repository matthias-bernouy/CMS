import type {
    CmsConditionExpression,
    CmsConditionFieldOperator,
    CmsSourceState,
    DataFieldType,
    Editor,
} from "@bernouy/cms-content/editor";

export type ConditionPickerSource = {
    editor: Editor;
    label: string;
    sourceName?: string;
};

export type ConditionPickerCondition = {
    sourceEditor: Editor;
    sourceState: CmsSourceState;
};

export type ConditionFieldOption = {
    path: string;
    label: string;
    scopeLabel: string;
    type?: DataFieldType;
};

export type ConditionPickerMode = "source" | "field" | "advanced";

export type ConditionPickerApplyDetail = {
    conditions: ConditionPickerCondition[];
    expression?: CmsConditionExpression;
};

export type FieldConditionDraft = {
    path: string;
    operator: CmsConditionFieldOperator;
    value: string;
};
