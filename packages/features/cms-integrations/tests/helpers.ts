import {
    InMemoryIntegrationInstallationRepository,
    type IntegrationDefinition,
    type IntegrationInstallation,
} from "@bernouy/cms-integrations";
import { InMemorySecretStore } from "@bernouy/cms-secrets";
import {
    sourceDtoToSource,
    type DataShape,
    type Source,
    type SourceDto,
    type SourceRepository,
} from "@bernouy/cms-sources";

const FEATURE_COLLECTION: DataShape = {
    type: "object",
    properties: {
        type: { type: "string" },
        features: {
            type: "array",
            items: {
                type: "object",
                properties: {
                    type: { type: "string" },
                    geometry: {
                        type: "object",
                        properties: {
                            type: { type: "string" },
                            coordinates: { type: "array", items: { type: "number" } },
                        },
                    },
                    properties: {
                        type: "object",
                        properties: {
                            label:    { type: "string" },
                            score:    { type: "number" },
                            type:     { type: "string" },
                            name:     { type: "string" },
                            postcode: { type: "string" },
                            citycode: { type: "string" },
                            city:     { type: "string" },
                            context:  { type: "string" },
                            x:        { type: "number" },
                            y:        { type: "number" },
                        },
                    },
                },
            },
        },
    },
};

const BAN_SOURCE_DTO: SourceDto = {
    id: "ban",
    meta: {
        name: "Base Adresse Nationale",
        description: "French national address geocoding API",
        icon: "map-pin",
    },
    endpoints: [
        {
            endpointId: "search",
            method: "GET",
            targetUrl: "https://api-adresse.data.gouv.fr/search/",
            meta: {
                name: "Address search",
                description: "Address to coordinates (GeoJSON)",
            },
            params: [
                { name: "q",            in: "query", required: true, description: "Address to geocode", type: "string" },
                { name: "limit",        in: "query", description: "Maximum number of results", type: "number" },
                { name: "autocomplete", in: "query", description: "1 enables autocomplete", type: "number" },
                { name: "type",         in: "query", description: "housenumber | street | locality | municipality", type: "string" },
                { name: "postcode",     in: "query", type: "string" },
                { name: "citycode",     in: "query", type: "string" },
            ],
            output: [{ status: "200", body: FEATURE_COLLECTION }],
        },
        {
            endpointId: "reverse",
            method: "GET",
            targetUrl: "https://api-adresse.data.gouv.fr/reverse/",
            meta: {
                name: "Reverse geocoding",
                description: "Coordinates to address",
            },
            params: [
                { name: "lat",  in: "query", required: true, description: "Latitude", type: "number" },
                { name: "lon",  in: "query", required: true, description: "Longitude", type: "number" },
                { name: "type", in: "query", type: "string" },
            ],
            output: [{ status: "200", body: FEATURE_COLLECTION }],
        },
    ],
};

export const BAN_DEFINITION: IntegrationDefinition = {
    kind: "ban",
    label: "Base Adresse Nationale",
    version: "1.0.0",
    category: "Data",
    inputs: [],
    artifacts: [
        { type: "source", source: BAN_SOURCE_DTO },
        {
            type: "dashboard",
            dashboard: {
                id: "ban-addresses",
                meta: { name: "Address search", icon: "map-pin" },
                source: "ban",
                views: [
                    {
                        widget: "w-table",
                        id: "addressesTable",
                        source: {
                            endpoint: "search",
                            params: { q: "$filter.q" },
                            itemsPath: "features",
                        },
                        rowKey: "properties.label",
                        filters: [{
                            id: "q",
                            param: "q",
                            type: "text",
                            label: "Search",
                            placeholder: "Search addresses",
                        }],
                        columns: [
                            { id: "address", path: "properties.label", label: "Address", primary: true },
                            { id: "city", path: "properties.city", label: "City" },
                            { id: "postcode", path: "properties.postcode", label: "Postcode" },
                            { id: "score", path: "properties.score", label: "Score" },
                        ],
                    },
                ],
            },
        },
    ],
};

export const TEST_SECRET_SOURCE_DEFINITION: IntegrationDefinition = {
    kind: "test-secret-source",
    label: "Test secret source",
    version: "1.0.0",
    category: "Test",
    inputs: [
        { name: "id", label: "Source id", type: "text", required: true, defaultValue: "test-source" },
        { name: "apiKey", label: "API key", type: "password", required: true, secret: true },
    ],
    secrets: [
        { input: "apiKey", key: "TEST_SOURCE_{{env answers.id}}_API_KEY" },
    ],
    artifacts: [
        {
            type: "source",
            source: {
                id: "{{answers.id}}",
                meta: { name: "Test secret source", icon: "key" },
                endpoints: [
                    {
                        endpointId: "listItems",
                        method: "GET",
                        targetUrl: "https://api.example.com/items",
                        params: [],
                        output: [{ status: "200", body: { type: "object" } }],
                        headers: [
                            {
                                name: "authorization",
                                source: { from: "secret", ref: "{{secrets.apiKey}}", prefix: "Bearer " },
                            },
                        ],
                    },
                ],
            },
        },
    ],
};

export const BAN_SOURCE = sourceDtoToSource(BAN_SOURCE_DTO);

export const searchParams = (value: string) => new URL(`http://local/?${value}`).searchParams;

export const banEndpoint = (urn: string) => BAN_SOURCE.endpoints.find(endpoint => endpoint.urn === urn)!;

export function sourceArtifact(id: string, targetUrl = "https://api.example.com/items") {
    return {
        type: "source" as const,
        source: {
            id,
            meta: { name: id },
            endpoints: [{
                endpointId: "list",
                method: "GET" as const,
                targetUrl,
                params: [],
                output: [{ status: "200" as const, body: { type: "object" as const } }],
            }],
        },
    };
}

export class FailingCreateSourceRepository implements SourceRepository {
    constructor(
        private readonly inner: SourceRepository,
        private readonly failUrn: string,
    ) {}

    createSource(source: Source): Promise<Source> {
        if (source.urn === this.failUrn) throw new Error(`create failed for ${source.urn}`);
        return this.inner.createSource(source);
    }

    updateSource(source: Source): Promise<Source | null> {
        return this.inner.updateSource(source);
    }

    deleteSource(urn: string): Promise<boolean> {
        return this.inner.deleteSource(urn);
    }

    getSource(urn: string): Promise<Source | null> {
        return this.inner.getSource(urn);
    }

    getAllSources(): Promise<Source[]> {
        return this.inner.getAllSources();
    }

    getEndpoint(urn: string) {
        return this.inner.getEndpoint(urn);
    }
}

export class DeleteFailingSecretStore extends InMemorySecretStore {
    async delete(key: string): Promise<void> {
        if (key === "B") throw new Error("delete failed");
        return super.delete(key);
    }
}

export class CreateFailingIntegrationInstallationRepository extends InMemoryIntegrationInstallationRepository {
    async create(): Promise<never> {
        throw new Error("installation create failed");
    }
}

export class SuccessReplaceFailingIntegrationInstallationRepository extends InMemoryIntegrationInstallationRepository {
    async replace(installation: IntegrationInstallation): Promise<IntegrationInstallation> {
        if (installation.status === "success" && installation.runCount === 2) {
            throw new Error("installation replace failed");
        }
        return super.replace(installation);
    }
}
