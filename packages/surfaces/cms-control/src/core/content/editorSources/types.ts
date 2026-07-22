import type { DataField, DataFieldType } from "@bernouy/cms-content/editor";
import type { HTTPMethod, ParamIn } from "@bernouy/cms-sources";

export type EditorSourceParamDto = {
    name: string;
    in: ParamIn;
    required?: boolean;
    type?: string;
    description?: string;
};

export type EditorSourceBodyFieldDto = {
    path: string;
    type: DataFieldType;
    required?: boolean;
    children?: EditorSourceBodyFieldDto[];
};

export type EditorSourceBodyDto = {
    contentType: "application/json";
    fields: EditorSourceBodyFieldDto[];
};

export type EditorSourceDto = {
    label: string;
    url: string;
    method: HTTPMethod;
    provider?: string;
    providerUrn?: string;
    endpointUrn?: string;
    providerLabel?: string;
    description?: string;
    params?: EditorSourceParamDto[];
    body?: EditorSourceBodyDto;
    fields: DataField[];
};
