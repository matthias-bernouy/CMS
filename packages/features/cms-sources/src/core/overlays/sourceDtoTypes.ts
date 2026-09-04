import type { DataShape } from "cms-sources/interfaces/DataShape";
import type {
    EndpointHeader,
    EndpointResponse,
    HTTPMethod,
    ParamIn,
    ParamValueSource,
    ResponseKind,
    SourceEndpointAccess,
    SourceEndpointEffects,
    SourceMeta,
} from "cms-sources/interfaces/Source";
import type {
    SourceIndexingCursorPagination,
    SourceIndexingIdentity,
    SourceIndexingOffsetPagination,
    SourceIndexingVariable,
} from "cms-sources/interfaces/SourceIndexing";

export type SourceParamDto = {
    name: string;
    in: ParamIn;
    type?: DataShape["type"];
    semantic?: DataShape["semantic"];
    required?: boolean;
    description?: string;
    source?: ParamValueSource;
};

export type SourceEndpointDto = {
    endpointId: string;
    contractVersion?: string;
    method: HTTPMethod;
    targetUrl: string;
    timeoutMs?: number;
    access?: SourceEndpointAccess;
    effects?: SourceEndpointEffects;
    responseKind?: ResponseKind;
    mediaType?: string;
    params: SourceParamDto[];
    body?: DataShape;
    output?: EndpointResponse[];
    meta?: SourceMeta;
    headers?: EndpointHeader[];
};

export type SourceIndexingEntityDto = {
    id: string;
    label: string;
    resolve: {
        endpointId: string;
        identity: SourceIndexingIdentity;
    };
    discover: {
        endpointId: string;
        itemsPath: string;
        identityPath: string;
        pagination?: SourceIndexingOffsetPagination | SourceIndexingCursorPagination;
        lastModifiedPath?: string;
    };
    variables: Record<string, SourceIndexingVariable>;
    defaults?: {
        titleTemplate?: string;
        descriptionTemplate?: string;
    };
};

export type SourceIndexingDto = {
    entities: SourceIndexingEntityDto[];
};

export type SourceDto = {
    id: string;
    identityAuthority?: string;
    meta: SourceMeta;
    endpoints: SourceEndpointDto[];
    indexing?: SourceIndexingDto;
};

export type SourceFlatDto = Record<string, string>;

export type CanonicalSourceEndpointDto = Omit<SourceEndpointDto, "body" | "output" | "meta" | "headers"> & {
    body: DataShape | null;
    output: EndpointResponse[] | null;
    meta: SourceMeta | null;
    headers: EndpointHeader[] | null;
};

export type CanonicalSourceDto = Omit<SourceDto, "endpoints" | "indexing"> & {
    endpoints: CanonicalSourceEndpointDto[];
    indexing: SourceIndexingDto | null;
};
