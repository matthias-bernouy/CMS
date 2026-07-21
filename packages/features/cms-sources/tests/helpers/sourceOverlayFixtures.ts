import type { DataShape, Source, SourceOverlay } from "@bernouy/cms-sources";

export const source: Source = {
    urn: "urn:user-account",
    endpoints: [
        {
            urn: "urn:user-account:getAccount",
            method: "GET",
            targetUrl: "https://api.example.com/account",
            output: [{ status: "200", body: accountShape() }],
        },
        {
            urn: "urn:user-account:listAccounts",
            method: "GET",
            targetUrl: "https://api.example.com/accounts",
            output: [
                {
                    status: "200",
                    body: {
                        type: "object",
                        properties: {
                            accounts: { type: "array", items: accountShape() },
                        },
                    },
                },
            ],
        },
        {
            urn: "urn:user-account:updateAccount",
            method: "POST",
            targetUrl: "https://api.example.com/account",
            input: { body: accountInputShape() },
        },
    ],
};

export const overlay: SourceOverlay = {
    id: "user-account-extra-fields",
    sourceId: "user-account",
    input: [{ endpointId: "updateAccount", editable: "self" }],
    output: [{ endpointId: "getAccount" }, { endpointId: "listAccounts", path: "accounts[]" }],
    fields: [
        { id: "company", label: "Company", type: "string", showInDashboardTable: true },
        { id: "employeeCount", label: "Employees", type: "number" },
    ],
};

function accountShape(): DataShape {
    return {
        type: "object",
        properties: {
            userId: { type: "string" },
            displayName: { type: "string" },
        },
    };
}

function accountInputShape() {
    return {
        type: "object" as const,
        properties: {
            displayName: { type: "string" as const },
        },
    };
}
