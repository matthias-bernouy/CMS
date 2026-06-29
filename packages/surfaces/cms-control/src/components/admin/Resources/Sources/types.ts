import type { SourceDto, SourceEndpointDto } from "@bernouy/cms-sources";

export type SourceRow = {
    urn: string;
    id: string;
    name: string;
    endpointCount: number;
    readonly: boolean;
};

export type SourceDetail = SourceRow & {
    meta?: SourceDto["meta"];
    endpoints: SourceEndpointDto[];
};
