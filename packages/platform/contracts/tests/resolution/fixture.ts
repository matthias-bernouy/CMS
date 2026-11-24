import { parseContractRelease } from "@bernouy/ulvia-contracts";
import {
    schemaDescriptorDigest,
    schemaResolverInputSchema,
    schemaDescriptorOutputSchema,
} from "@bernouy/ulvia-contracts/resolution";
import { contractDocument } from "../support/fixtures";
export const string = { type: "string", maxLength: 64 } as const;
export const node = {
    type: "resolved",
    resolver: "forms.describe",
    selector: { formId: { source: "value", path: "/formId" } },
    version: { source: "value", path: "/formVersion" },
} as const;
export const schema = {
    type: "object",
    properties: { formId: string, formVersion: { type: "integer" }, answers: node },
    required: ["formId", "formVersion", "answers"],
} as const;
export const concrete = { type: "object", properties: { email: string }, required: ["email"] } as const;
export const descriptor = {
    resourceId: "contact",
    version: "2",
    schemaJson: JSON.stringify(concrete),
    fields: [],
    digest: schemaDescriptorDigest(concrete, []),
};
export const resolver = {
    id: "forms.describe",
    access: "public",
    behavior: { effect: "query", execution: "sync", sensitive: true },
    schemaResolver: { selector: { type: "object", properties: { formId: string }, required: ["formId"] } },
    bindings: [
        {
            id: "http",
            transport: "http",
            method: "QUERY",
            path: "/forms/describe",
            input: { body: true },
            response: {
                successStatuses: [200],
                contentTypes: ["application/json"],
                errorStatuses: { SCHEMA_VERSION_CONFLICT: 409 },
            },
        },
    ],
    input: schemaResolverInputSchema,
    output: schemaDescriptorOutputSchema,
    errors: [{ code: "SCHEMA_VERSION_CONFLICT", retryable: false }],
} as const;
export const release = () =>
    parseContractRelease(
        contractDocument({ capabilities: [resolver], events: [{ id: "submitted", sensitive: false, schema }] }),
    );
