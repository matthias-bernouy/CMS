export type CapabilityHttpMethod = "DELETE" | "GET" | "HEAD" | "PATCH" | "POST" | "PUT";

export interface HttpBodyPropertiesBinding {
    readonly properties: readonly string[];
}

export interface HttpBinaryBodyBinding {
    readonly binaryProperty: string;
}

export interface HttpInputBinding {
    readonly body?: true | HttpBinaryBodyBinding | HttpBodyPropertiesBinding;
    readonly headers?: Readonly<Record<string, string>>;
    readonly path?: Readonly<Record<string, string>>;
    readonly query?: Readonly<Record<string, string>>;
}

export interface HttpResponseBinding {
    readonly contentTypes: readonly string[];
    readonly errorStatuses: Readonly<Record<string, number>>;
    readonly successStatuses: readonly number[];
}

export interface HttpBindingDefinition {
    readonly input?: HttpInputBinding;
    readonly method: CapabilityHttpMethod;
    readonly path: string;
    readonly response: HttpResponseBinding;
    readonly transport: "http";
}

export interface CompiledHttpParameter {
    readonly encoding: "uri-component";
    readonly property: string;
    readonly wireName: string;
}

export type HttpParameterValue = boolean | number | string | null;

export type CompiledHttpErrorEnvelope =
    | { readonly kind: "json" }
    | {
          readonly kind: "headers";
          readonly encoding: "json-percent";
          readonly codeHeader: "x-ulvia-error-code";
          readonly requestIdHeader: "x-ulvia-request-id";
      };

export interface CompiledJsonHttpBody {
    readonly contentTypes: readonly ["application/json"];
    readonly kind: "json";
    readonly properties: readonly string[];
}

export interface CompiledBinaryHttpBody {
    readonly contentTypes: readonly string[];
    readonly kind: "binary";
    readonly property: string;
}

export type CompiledHttpBody = CompiledBinaryHttpBody | CompiledJsonHttpBody;

export interface CompiledHttpResponse {
    readonly contentTypes: readonly string[];
    readonly errorEnvelope: CompiledHttpErrorEnvelope;
    readonly errorStatuses: Readonly<Record<string, number>>;
    readonly kind: "operation-handle" | "result";
    readonly successStatuses: readonly number[];
}

export interface CompiledHttpBinding {
    readonly body: CompiledHttpBody | null;
    readonly headers: readonly CompiledHttpParameter[];
    readonly method: CapabilityHttpMethod;
    readonly path: string;
    readonly pathParameters: readonly CompiledHttpParameter[];
    readonly query: readonly CompiledHttpParameter[];
    readonly response: CompiledHttpResponse;
    readonly routeKey: string;
}

export interface CompiledCapabilityBinding {
    readonly binding: CompiledHttpBinding;
    readonly capabilityId: string;
}
