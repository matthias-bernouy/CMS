import type { Dashboard } from "@bernouy/cms-dashboards";
import type { Source, SourceOverlay } from "@bernouy/cms-sources";

export const sourceOverlay: SourceOverlay = {
    id: "user-account-extra-fields",
    sourceId: "user-account",
    input: [{ endpointId: "createUserPersonalInformation", editable: "admin" }],
    output: [
        { endpointId: "listAccounts", path: "accounts[]" },
        { endpointId: "getAccountByUserId" },
    ],
    sections: [{ id: "accountFields", label: "Personal information" }],
    fields: [
        { id: "company", label: "Company", type: "string", section: "accountFields", showInDashboardTable: true },
        { id: "optIn", label: "Opt-in", type: "boolean", adminEditable: false },
    ],
};

export const source: Source = {
    urn: "urn:user-account",
    endpoints: [
        {
            urn: "urn:user-account:listAccounts",
            method: "GET",
            targetUrl: "https://api.example.com/accounts",
            output: [{ status: "200", body: accountsShape() }],
        },
        {
            urn: "urn:user-account:getAccountByUserId",
            method: "GET",
            targetUrl: "https://api.example.com/account",
            input: { params: [{ name: "userId", in: "query", schema: { type: "string" } }] },
            output: [{ status: "200", body: { type: "object", properties: { userId: { type: "string" } } } }],
        },
        {
            urn: "urn:user-account:createUserPersonalInformation",
            method: "POST",
            targetUrl: "https://api.example.com/account",
            input: {
                params: [{ name: "userId", in: "query", schema: { type: "string" } }],
                body: { type: "object", properties: { displayName: { type: "string" } } },
            },
        },
    ],
};

export const dashboard: Dashboard = {
    id: "user-account-users",
    source: "user-account",
    views: [
        {
            widget: "w-table",
            id: "accountsTable",
            source: { endpoint: "listAccounts", itemsPath: "accounts" },
            rowKey: "userId",
            columns: [{ id: "userId", label: "User", path: "userId" }],
            selection: { opens: "accountDetail" },
        },
        {
            widget: "w-detail",
            id: "accountDetail",
            source: { endpoint: "getAccountByUserId", params: { userId: "$selection.id" } },
            actions: [{
                id: "save",
                label: "Save",
                endpoint: {
                    endpoint: "createUserPersonalInformation",
                    params: { userId: "$resource.userId" },
                    body: { displayName: "$field.displayName" },
                },
            }],
            main: [{
                id: "accountFields",
                title: "Personal information",
                fields: [{ id: "displayName", label: "Name", path: "displayName", type: "text" }],
            }],
        },
    ],
};

function accountsShape() {
    return {
        type: "object" as const,
        properties: {
            accounts: {
                type: "array" as const,
                items: { type: "object" as const, properties: { userId: { type: "string" as const } } },
            },
        },
    };
}
