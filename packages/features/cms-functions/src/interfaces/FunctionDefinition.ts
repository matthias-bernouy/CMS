import type { DataShape, EndpointResponse, HTTPMethod, SourceEndpointAccess, SourceMeta } from "@bernouy/cms-sources";

export type FunctionExpression = string;

export type FunctionValue = null | string | number | boolean | FunctionValue[] | { [key: string]: FunctionValue };

export type FunctionEndpointInput = {
    params?: Record<string, DataShape>;
    body?: DataShape;
};

export type FunctionCall = {
    source: string;
    endpoint: string;
    params?: Record<string, FunctionValue>;
    body?: FunctionValue;
};

export type FunctionCondition =
    | { equals: [FunctionValue, FunctionValue] }
    | { notEquals: [FunctionValue, FunctionValue] }
    | { in: [FunctionValue, FunctionValue] }
    | { exists: FunctionValue }
    | { gt: [FunctionValue, FunctionValue] }
    | { gte: [FunctionValue, FunctionValue] }
    | { lt: [FunctionValue, FunctionValue] }
    | { lte: [FunctionValue, FunctionValue] }
    | { any: FunctionCondition[] }
    | { all: FunctionCondition[] }
    | { not: FunctionCondition };

export type FunctionAssert = {
    condition: FunctionCondition;
    failure?: {
        status?: number;
        error?: string;
    };
};

export type FunctionForEach = {
    items: FunctionValue;
    max: number;
    steps: FunctionStep[];
    yield?: FunctionValue;
    continueOnError?: boolean;
    onError?: FunctionStep[];
    errorYield?: FunctionValue;
};

export type FunctionStep =
    | {
          id: string;
          call: FunctionCall;
      }
    | {
          id: string;
          forEach: FunctionForEach;
      }
    | {
          assert: FunctionAssert;
      };

export type FunctionReturn = {
    status?: number;
    body?: FunctionValue;
};

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
          params?: Record<string, FunctionValue>;
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
              params?: Record<string, FunctionValue>;
              pathsPath: string;
              pathNamePath?: string;
              samplePath?: string;
          };
      };

export type FunctionExecuteUi = {
    fields?: FunctionExecuteField[];
};

export type FunctionUi = {
    execute?: FunctionExecuteUi;
};

export type FunctionDefinition = {
    id: string;
    method: HTTPMethod;
    access?: SourceEndpointAccess;
    meta?: SourceMeta;
    input?: FunctionEndpointInput;
    output?: EndpointResponse[];
    ui?: FunctionUi;
    steps: FunctionStep[];
    return: FunctionReturn;
};

export type CmsFunction = FunctionDefinition;
export type FunctionDto = FunctionDefinition;
