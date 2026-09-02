import { describe, expect, test } from "bun:test";
import { InMemoryDashboardViewRepository, normalizeLegacyDashboardView } from "@bernouy/cms-dashboards";
import {
    InMemorySourceOverlayRepository,
    InMemorySourceRepository,
    SourceOverlaySourceRepository,
} from "@bernouy/cms-sources";
import listDashboards from "cms-control/api/_platform/dashboards.get";

const list = () => new Request("http://localhost/cms/api/dashboards", { method: "GET" });

describe("GET /api/dashboards source overlays", () => {
    test("applies overlays to dashboard groups", async () => {
        const sources = new InMemorySourceRepository();
        const sourceOverlays = new InMemorySourceOverlayRepository();
        const dashboardViews = new InMemoryDashboardViewRepository();
        await sources.createSource({
            urn: "urn:user-account",
            endpoints: [
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
                                    accounts: {
                                        type: "array",
                                        items: { type: "object", properties: { userId: { type: "string" } } },
                                    },
                                },
                            },
                        },
                    ],
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
                    input: { body: { type: "object", properties: { displayName: { type: "string" } } } },
                },
            ],
        });
        await sourceOverlays.upsertOverlay({
            id: "user-account-extra-fields",
            sourceId: "user-account",
            input: [{ endpointId: "createUserPersonalInformation", editable: "admin" }],
            output: [{ endpointId: "listAccounts", path: "accounts[]" }, { endpointId: "getAccountByUserId" }],
            fields: [{ id: "company", label: "Company", type: "string", showInDashboardTable: true }],
        });
        await dashboardViews.createView(
            normalizeLegacyDashboardView({
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
                        actions: [
                            {
                                id: "save",
                                label: "Save",
                                endpoint: {
                                    endpoint: "createUserPersonalInformation",
                                    body: { displayName: "$field.displayName" },
                                },
                            },
                        ],
                        main: [
                            {
                                id: "personal",
                                title: "Personal information",
                                fields: [{ id: "displayName", label: "Name", path: "displayName", type: "text" }],
                            },
                        ],
                    },
                ],
            }),
        );

        const body = await (
            await listDashboards(list(), {
                sources: new SourceOverlaySourceRepository(sources, sourceOverlays),
                dashboardViews,
                sourceOverlays,
            } as any)
        ).json();

        expect(body[0].sourceOverlays).toHaveLength(1);
        expect(body[0].settings).toBeUndefined();
        expect(
            body[0].endpoints.find((endpoint: any) => endpoint.endpointId === "getAccountByUserId").output[0].body,
        ).toMatchObject({
            properties: { metadata: { properties: { company: { type: "string" } } } },
        });
        expect(body[0].dashboards[0].views[0].columns).toContainEqual({
            id: "company",
            label: "Company",
            path: "metadata.company",
        });
    });
});
