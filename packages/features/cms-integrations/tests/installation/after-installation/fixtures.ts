import type { IntegrationDefinition } from "@bernouy/cms-integrations";

export function producerDefinition(): IntegrationDefinition {
    return {
        kind: "producer",
        label: "Producer",
        inputs: [{ name: "id", label: "Source id", type: "text", required: true }],
        dependencies: [{ name: "target", kind: "target", optional: true }],
        afterInstallation: [
            {
                id: "sync-templates",
                requires: ["target"],
                steps: [
                    {
                        id: "templates",
                        call: {
                            source: "{{answers.id}}",
                            endpoint: "listTemplates",
                        },
                    },
                    {
                        id: "installation",
                        call: {
                            source: "{{dependencies.target.answers.id}}",
                            endpoint: "installTemplates",
                            body: { templates: "$steps.templates.items" },
                        },
                    },
                ],
            },
        ],
        artifacts: [
            {
                type: "source",
                source: {
                    id: "{{answers.id}}",
                    meta: { name: "Producer" },
                    endpoints: [
                        {
                            endpointId: "listTemplates",
                            method: "GET",
                            access: { mode: "system" },
                            targetUrl: "https://producer.test/templates",
                            params: [],
                            output: [
                                {
                                    status: "200",
                                    body: {
                                        type: "object",
                                        properties: {
                                            items: {
                                                type: "array",
                                                items: {
                                                    type: "object",
                                                    properties: { key: { type: "string" } },
                                                    required: ["key"],
                                                },
                                            },
                                        },
                                        required: ["items"],
                                    },
                                },
                            ],
                        },
                    ],
                },
            },
            {
                type: "source",
                source: {
                    id: "{{answers.id}}-audit",
                    meta: { name: "Target audit" },
                    endpoints: [],
                },
            },
        ],
    };
}

export function targetDefinition(): IntegrationDefinition {
    return {
        kind: "target",
        label: "Target",
        inputs: [{ name: "id", label: "Source id", type: "text", required: true }],
        artifacts: [
            {
                type: "source",
                source: {
                    id: "{{answers.id}}",
                    meta: { name: "Target" },
                    endpoints: [
                        {
                            endpointId: "installTemplates",
                            method: "POST",
                            access: { mode: "system" },
                            targetUrl: "https://target.test/templates/install",
                            params: [],
                            body: {
                                type: "object",
                                properties: {
                                    templates: {
                                        type: "array",
                                        items: {
                                            type: "object",
                                            properties: { key: { type: "string" } },
                                            required: ["key"],
                                        },
                                    },
                                },
                                required: ["templates"],
                            },
                            output: [{ status: "200", body: { type: "object" } }],
                        },
                    ],
                },
            },
        ],
    };
}
