import { afterEach, describe, expect, test } from "bun:test";
import type { DashboardDto } from "@bernouy/cms-dashboards";
import type { DashboardSourceGroup } from "../../src/components/admin/Resources/Dashboards/types";
import { executeDashboardTableAction } from "../../src/components/admin/Resources/Dashboards/runtime/actions";

const realFetch = globalThis.fetch;

afterEach(() => {
    globalThis.fetch = realFetch;
    document.head.innerHTML = "";
});

describe("dashboard table actions", () => {
    test("downloads file responses from table endpoint actions", async () => {
        const requests: Request[] = [];
        globalThis.fetch = (async (input, init) => {
            const request = new Request(input, init);
            requests.push(request);
            return new Response("email,subscribed\nuser@example.com,true\n", {
                status: 200,
                headers: { "content-type": "text/csv; charset=utf-8" },
            });
        }) as typeof fetch;

        const result = await executeDashboardTableAction(group(), dashboard(), "exportSubscriptions", "subscriptionsTable");

        expect(requests).toHaveLength(1);
        expect(requests[0]!.url).toBe("http://localhost:4999/.cms/sources/newsletter/exportSubscriptions");
        expect(requests[0]!.headers.get("accept")).toBe("*/*");
        expect(result.kind).toBe("download");
        if (result.kind === "download") {
            expect(result.filename).toBe("newsletter-subscriptions.csv");
            expect(await result.blob.text()).toBe("email,subscribed\nuser@example.com,true\n");
        }
    });
});

function group(): DashboardSourceGroup {
    return {
        source: {
            urn: "urn:newsletter",
            id: "newsletter",
            name: "Newsletter",
            endpointCount: 1,
            dashboardCount: 1,
            readonly: false,
        },
        endpoints: [
            {
                endpointId: "exportSubscriptions",
                method: "GET",
                targetUrl: "https://project.supabase.co/functions/v1/cms-newsletter/subscriptions/export",
                responseKind: "file",
                mediaType: "text/csv",
                params: [],
            },
        ],
        dashboards: [],
    };
}

function dashboard(): DashboardDto {
    return {
        id: "newsletter-subscriptions",
        source: "newsletter",
        views: [
            {
                widget: "w-table",
                id: "subscriptionsTable",
                source: { endpoint: "listSubscriptions", itemsPath: "subscriptions" },
                rowKey: "email",
                columns: [{ id: "email", label: "Email", path: "email", primary: true }],
                actions: [
                    {
                        id: "exportSubscriptions",
                        label: "Export CSV",
                        endpoint: { endpoint: "exportSubscriptions" },
                        download: { filename: "newsletter-subscriptions.csv" },
                    },
                ],
            },
        ],
    };
}
