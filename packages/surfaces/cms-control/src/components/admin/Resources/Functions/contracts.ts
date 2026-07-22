import type { DataShape, EndpointResponse } from "@bernouy/cms-sources";

export type FunctionUiValue = null | string | number | boolean | FunctionUiValue[] | { [key: string]: FunctionUiValue };

export type FunctionExecuteField =
    | {
          control: "text";
          path: string;
          label?: string;
      }
    | {
          control: "source-select";
          path: string;
          label?: string;
          source: string;
          endpoint: string;
          params?: Record<string, FunctionUiValue>;
          itemsPath?: string;
          labelPath?: string;
          valuePath?: string;
      }
    | {
          control: "json-object";
          path: string;
          label?: string;
          seed?: {
              type: "paths";
              dependsOn?: string;
              source: string;
              endpoint: string;
              params?: Record<string, FunctionUiValue>;
              pathsPath: string;
              pathNamePath?: string;
              samplePath?: string;
          };
      };

export type FunctionExecuteUi = {
    fields?: FunctionExecuteField[];
};

export type FunctionDetail = {
    id: string;
    label: string;
    description: string;
    method: string;
    access: string;
    paramsLabel: string;
    bodyLabel: string;
    inputLabel: string;
    stepsLabel: string;
    outputLabel: string;
    returnLabel: string;
    params?: Record<string, DataShape>;
    body?: DataShape;
    paramsSample: Record<string, unknown>;
    bodySample?: unknown;
    ui?: {
        execute?: FunctionExecuteUi;
    };
    steps: unknown[];
    output?: unknown[];
    return: unknown;
};

export type FunctionExecutionResult = {
    ok: boolean;
    status: number;
    body: unknown;
    contentType: string;
};

export type FunctionCatalogEndpoint = {
    endpointId: string;
    method: string;
    params: Array<{ name: string; required?: boolean; type?: string; semantic?: DataShape["semantic"] }>;
    body?: DataShape;
    output?: EndpointResponse[];
    meta?: { name?: string; description?: string };
};

export type FunctionCatalogSource = {
    id: string;
    label: string;
    endpoints: FunctionCatalogEndpoint[];
};
