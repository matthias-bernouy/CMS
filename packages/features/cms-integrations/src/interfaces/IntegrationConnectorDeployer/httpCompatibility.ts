import type { HTTPMethod } from "@bernouy/cms-sources";

export type DeclarativeConnectorFunctionHttpStringFormat =
    | "date"
    | "date-time"
    | "email"
    | "hostname"
    | "ipv4"
    | "ipv6"
    | "uri"
    | "uuid";

type DeclarativeConnectorFunctionHttpShapeCommon = {
    nullable?: boolean;
};

/**
 * Strict JSON response contract used by connector compatibility checks.
 *
 * This intentionally supports a bounded JSON Schema subset. Each variant only
 * exposes constraints meaningful for its declared type; the definition parser
 * rejects unknown or misplaced keywords instead of discarding them.
 */
export type DeclarativeConnectorFunctionHttpDataShape = DeclarativeConnectorFunctionHttpShapeCommon &
    (
        | {
              type: "string";
              enum?: string[];
              format?: DeclarativeConnectorFunctionHttpStringFormat;
              pattern?: string;
              minLength?: number;
              maxLength?: number;
          }
        | { type: "number"; enum?: number[]; minimum?: number; maximum?: number }
        | { type: "boolean"; enum?: boolean[] }
        | {
              type: "object";
              properties?: Record<string, DeclarativeConnectorFunctionHttpDataShape>;
              required?: string[];
          }
        | {
              type: "array";
              items?: DeclarativeConnectorFunctionHttpDataShape;
              minItems?: number;
              maxItems?: number;
          }
    );

export type DeclarativeConnectorFunctionHttpResponseContract = {
    status: string;
    body?: DeclarativeConnectorFunctionHttpDataShape;
};

export type DeclarativeConnectorFunctionHttpEndpointContract = {
    route: string;
    method: HTTPMethod;
    requiredInputs: string[];
    requiredHeaders: string[];
    responses: DeclarativeConnectorFunctionHttpResponseContract[];
};

export type DeclarativeConnectorFunctionHttpContract = {
    endpoints: DeclarativeConnectorFunctionHttpEndpointContract[];
    requiredSecrets: string[];
};

export type DeclarativeConnectorFunctionCompatibility = {
    http?: DeclarativeConnectorFunctionHttpContract;
};

export type DeclarativeConnectorFunctionTemplate = {
    name: string;
    directory: string;
    configPath?: string;
    secrets?: Record<string, string>;
    compatibility?: DeclarativeConnectorFunctionCompatibility;
};
