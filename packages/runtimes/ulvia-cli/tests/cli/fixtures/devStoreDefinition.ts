export const DEV_INTEGRATION_KIND = "dev-persistence";
export const DEV_SOURCE_ID = "dev-store";
export const DEV_DASHBOARD_ID = "dev-store-records";

export function devStoreDefinition(): Record<string, unknown> {
    return {
        schema: "cms.integration.definition.v2",
        kind: DEV_INTEGRATION_KIND,
        label: "Development persistence fixture",
        version: "1.0.0",
        category: "Tests",
        description: "Generic Supabase-backed fixture for the local development runtime.",
        inputs: [],
        generatedSecrets: [
            {
                name: "cmsApiKey",
                key: "DEV_PERSISTENCE_API_KEY",
                generator: "token",
                bytes: 32,
                prefix: "cms_dev_",
            },
        ],
        connectors: [
            {
                provider: "supabase",
                root: "connectors/supabase",
                dataApiSchemas: ["dev_store"],
                compatibility: {
                    schema: {
                        namespaces: [
                            {
                                name: "dev_store",
                                relations: [
                                    {
                                        kind: "table",
                                        name: "records",
                                        columns: [
                                            { name: "key", nullable: false, type: "text" },
                                            { name: "value", nullable: false, type: "text" },
                                        ],
                                        constraints: [
                                            {
                                                columns: ["key"],
                                                deferrable: false,
                                                initiallyDeferred: false,
                                                kind: "primary-key",
                                                name: "records_pkey",
                                                validated: true,
                                            },
                                        ],
                                    },
                                ],
                            },
                        ],
                    },
                },
                schemas: [{ manifest: "sql/schema.manifest.json" }],
                functions: [
                    {
                        name: "cms-dev-store",
                        directory: "functions/cms-dev-store",
                        configPath: "supabase.config.toml",
                        secrets: { CMS_DEV_STORE_API_KEY: "{{generated.cmsApiKey}}" },
                    },
                ],
            },
        ],
        artifacts: [sourceArtifact(), dashboardArtifact()],
        type: "source",
    };
}

function sourceArtifact(): Record<string, unknown> {
    return {
        type: "source",
        endpointContractVersion: "1.0.0",
        source: {
            id: DEV_SOURCE_ID,
            meta: { name: "Development records", description: "Local persistence test records." },
            endpoints: [
                {
                    endpointId: "upsertRecord",
                    method: "POST",
                    access: "public",
                    targetUrl: "{{connectors.supabase.functionsBaseUrl}}/cms-dev-store/record",
                    headers: serviceHeaders(),
                    params: [],
                    body: {
                        type: "object",
                        properties: { key: { type: "string" }, value: { type: "string" } },
                        required: ["key", "value"],
                    },
                    output: [{ status: "200", body: recordSchema() }],
                },
                {
                    endpointId: "listRecords",
                    method: "GET",
                    access: "admin",
                    targetUrl: "{{connectors.supabase.functionsBaseUrl}}/cms-dev-store/records",
                    headers: serviceHeaders(),
                    params: [],
                    output: [
                        {
                            status: "200",
                            body: {
                                type: "object",
                                properties: { records: { type: "array", items: recordSchema() } },
                                required: ["records"],
                            },
                        },
                    ],
                },
            ],
        },
    };
}

function dashboardArtifact(): Record<string, unknown> {
    return {
        type: "dashboard-view",
        view: {
            id: DEV_DASHBOARD_ID,
            meta: { name: "Development records", icon: "database" },
            source: DEV_SOURCE_ID,
            views: [
                {
                    widget: "w-table",
                    id: "recordsTable",
                    title: "Records",
                    source: { endpoint: "listRecords", itemsPath: "records" },
                    rowKey: "key",
                    columns: [
                        { id: "key", label: "Key", path: "key", primary: true },
                        { id: "value", label: "Value", path: "value" },
                    ],
                },
            ],
        },
    };
}

function serviceHeaders(): unknown[] {
    return [
        {
            name: "authorization",
            source: { from: "secret", ref: "{{secrets.cmsApiKey}}", prefix: "Bearer " },
        },
    ];
}

function recordSchema(): Record<string, unknown> {
    return {
        type: "object",
        properties: { key: { type: "string" }, value: { type: "string" } },
        required: ["key", "value"],
    };
}

export const DEV_STORE_SQL = `create schema if not exists dev_store;
create table if not exists dev_store.records (
    key text primary key,
    value text not null
);
grant usage on schema dev_store to service_role;
grant all on table dev_store.records to service_role;
`;

export const DEV_STORE_SQL_MANIFEST = {
    schema: "cms.integration.sql-bundle.v1",
    transaction: "atomic",
    entries: [{ file: "model.sql" }],
};
