import type { DataShape, EndpointResponse, HTTPMethod, SourceMeta } from "@bernouy/cms-sources";

export type FunctionExpression = string;

export type FunctionValue =
    | null
    | string
    | number
    | boolean
    | FunctionValue[]
    | { [key: string]: FunctionValue };

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

export type FunctionStep =
    | {
        id: string;
        call: FunctionCall;
    }
    | {
        assert: FunctionAssert;
    };

export type FunctionReturn = {
    status?: number;
    body?: FunctionValue;
};

export type FunctionDefinition = {
    id: string;
    method: HTTPMethod;
    meta?: SourceMeta;
    input?: FunctionEndpointInput;
    output?: EndpointResponse[];
    steps: FunctionStep[];
    return: FunctionReturn;
};

export type CmsFunction = FunctionDefinition;
export type FunctionDto = FunctionDefinition;
