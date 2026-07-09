import type { DataShape } from "../interfaces/DataShape";
import type {
    EndpointHeader,
    EndpointResponse,
    HTTPMethod,
    ParamIn,
    ParamValueSource,
    ResponseKind,
    SourceEndpointAccess,
    SourceMeta,
} from "../interfaces/Source";

export type SourceParamDto = {
    name: string;
    in: ParamIn;
    type?: DataShape["type"];
    required?: boolean;
    description?: string;
    source?: ParamValueSource;
};

export type SourceEndpointDto = {
    endpointId: string;
    method: HTTPMethod;
    targetUrl: string;
    access?: SourceEndpointAccess;
    responseKind?: ResponseKind;
    mediaType?: string;
    params: SourceParamDto[];
    body?: DataShape;
    output?: EndpointResponse[];
    meta?: SourceMeta;
    headers?: EndpointHeader[];
};

export type SourceDto = {
    id: string;
    meta: SourceMeta;
    endpoints: SourceEndpointDto[];
};

export type SourceFlatDto = Record<string, string>;

export type CanonicalSourceEndpointDto = Omit<SourceEndpointDto, "body" | "output" | "meta" | "headers"> & {
    body: DataShape | null;
    output: EndpointResponse[] | null;
    meta: SourceMeta | null;
    headers: EndpointHeader[] | null;
};

export type CanonicalSourceDto = Omit<SourceDto, "endpoints"> & {
    endpoints: CanonicalSourceEndpointDto[];
};
