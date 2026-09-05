import { afterEach, describe, expect, test } from "bun:test";
import type { DashboardDto, DashboardWidget } from "@bernouy/cms-dashboards";
import "cms-control/components";
import { widgetsForSelection } from "cms-control/components/admin/Resources/Dashboards/domain";
import type { DashboardSourceGroup } from "cms-control/components/admin/Resources/Dashboards/types";
import { mountDashboardWidgets } from "cms-control/components/admin/Resources/Dashboards/runtime/mounting/mount";
import {
    appendSourceContent,
    urlSourceWrapper,
} from "cms-control/components/admin/Resources/Dashboards/runtime/mounting/mountSource";

const realFetch = globalThis.fetch;

afterEach(() => {
    globalThis.fetch = realFetch;
    document.body.replaceChildren();
});

describe("dashboard runtime source states", () => {
    test("keeps editable content unmounted after a failed load and retries safely", async () => {
        let calls = 0;
        globalThis.fetch = (async () => {
            calls += 1;
            if (calls === 1) {
                return new Response("unavailable", { status: 503 });
            }
            return Response.json({ mode: "marketplace" });
        }) as unknown as typeof fetch;

        const core = document.createElement("cms-binding-core");
        const wrapper = urlSourceWrapper("/settings", "dashboardData");
        const editable = document.createElement("section");
        editable.dataset.editableSettings = "true";
        editable.innerHTML = '<button type="button">Save settings</button>';
        appendSourceContent(wrapper, editable);
        core.append(wrapper);
        document.body.append(core);

        await waitFor(() => wrapper.querySelector("[role='alert']") !== null);

        expect(wrapper.querySelector("[data-editable-settings]")).toBeNull();
        expect(wrapper.textContent).toContain("Unable to load this data");
        expect(wrapper.textContent).toContain("Nothing can be changed until the data is available.");
        expect(wrapper.textContent).toContain("HTTP 503");
        expect(wrapper.textContent).not.toContain("Save settings");

        wrapper.querySelector<HTMLButtonElement>("[data-dashboard-source-retry]")!.click();
        await waitFor(() => wrapper.querySelector("[data-editable-settings]") !== null);

        expect(calls).toBe(2);
        expect(wrapper.querySelector("[role='alert']")).toBeNull();
        expect(wrapper.textContent).toContain("Save settings");
    });

    test("still mounts creation content for an empty successful response", async () => {
        globalThis.fetch = (async () => Response.json({})) as unknown as typeof fetch;

        const core = document.createElement("cms-binding-core");
        const wrapper = urlSourceWrapper("/new-record", "dashboardData");
        const creationForm = document.createElement("form");
        creationForm.dataset.creationForm = "true";
        appendSourceContent(wrapper, creationForm);
        core.append(wrapper);
        document.body.append(core);

        await waitFor(() => wrapper.querySelector("[data-creation-form]") !== null);

        expect(wrapper.querySelector("[role='alert']")).toBeNull();
        expect(wrapper.querySelector("[data-creation-form]")).not.toBeNull();
    });

    test("does not request a widget source while its required selection param is unresolved", async () => {
        const requests: Request[] = [];
        globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
            requests.push(new Request(input, init));
            return Response.json({ items: [] });
        }) as unknown as typeof fetch;
        const dashboard: DashboardDto = {
            id: "payments",
            source: "commerce",
            views: [],
        };
        const widget = {
            widget: "w-table",
            id: "claimEvidenceTable",
            title: "Claim evidence",
            source: {
                endpoint: "claimEvidenceItems",
                params: { claimId: "$selection.claimDetail.id", limit: "100" },
                itemsPath: "items",
            },
            rowKey: "id",
            columns: [{ id: "id", label: "ID", path: "id", primary: true }],
        } satisfies Extract<DashboardWidget, { widget: "w-table" }>;
        const group: DashboardSourceGroup = {
            source: {
                urn: "urn:commerce",
                id: "commerce",
                name: "Commerce",
                endpointCount: 1,
                dashboardCount: 1,
                readonly: false,
            },
            endpoints: [
                {
                    endpointId: "claimEvidenceItems",
                    method: "GET",
                    targetUrl: "https://example.test/claim-evidence",
                    params: [{ name: "claimId", in: "query", type: "string", required: true }],
                },
            ],
            dashboards: [dashboard],
        };
        const root = document.createElement("div");
        mountDashboardWidgets(
            root,
            [widget],
            { group, dashboard, selectedRows: new Map(), drafts: new Map() },
            "root",
            new Map(),
            null,
        );
        document.body.append(root);
        await new Promise((resolve) => setTimeout(resolve, 20));

        expect(root.querySelector("[cms-source*='claimEvidenceItems']") !== null).toBeFalse();
        expect(requests).toHaveLength(0);
    });

    test("mounts a new detail without requesting the source with its internal row key", async () => {
        const requests: Request[] = [];
        globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
            requests.push(new Request(input, init));
            return Response.json({});
        }) as unknown as typeof fetch;
        const dashboard: DashboardDto = {
            id: "sample-brand",
            source: "sampleBrand",
            views: [],
        };
        const widget = {
            widget: "w-detail",
            id: "albumDetail",
            source: { endpoint: "manageAlbum", params: { id: "$selection.id" } },
            main: [],
        } satisfies Extract<DashboardWidget, { widget: "w-detail" }>;
        const group: DashboardSourceGroup = {
            source: {
                urn: "urn:sample-brand",
                id: "sampleBrand",
                name: "Sample Brand",
                endpointCount: 1,
                dashboardCount: 1,
                readonly: false,
            },
            endpoints: [
                {
                    endpointId: "manageAlbum",
                    method: "GET",
                    targetUrl: "https://example.test/albums",
                    params: [{ name: "id", in: "query", type: "string", required: true }],
                },
            ],
            dashboards: [dashboard],
        };
        const root = document.createElement("div");
        const detail = { collection: "albumDetail", row: "__new__" };

        mountDashboardWidgets(
            root,
            [widget],
            { group, dashboard, selectedRows: new Map(), drafts: new Map() },
            "root",
            new Map(),
            detail,
        );
        document.body.append(root);
        await new Promise((resolve) => setTimeout(resolve, 20));

        expect(root.querySelector("[cms-source]")).toBeNull();
        expect(root.querySelector("cms-dashboard-w-detail")?.getAttribute("data-source-json")).toBe("{}");
        expect(requests).toHaveLength(0);
    });

    test("mounts table sources with the current widget filters", () => {
        const dashboard: DashboardDto = {
            id: "products",
            source: "commerce",
            views: [],
        };
        const widget = {
            widget: "w-table",
            id: "productsTable",
            source: {
                endpoint: "products",
                params: { q: "$filter.q", status: "$filter.status", limit: "100" },
                itemsPath: "items",
            },
            rowKey: "id",
            columns: [{ id: "title", label: "Product", path: "title", primary: true }],
            filters: [
                { id: "q", label: "Search", type: "text" },
                {
                    id: "status",
                    label: "Status",
                    type: "select",
                    options: [{ value: "published", label: "Published" }],
                },
            ],
        } satisfies Extract<DashboardWidget, { widget: "w-table" }>;
        const group: DashboardSourceGroup = {
            source: {
                urn: "urn:commerce",
                id: "commerce",
                name: "Commerce",
                endpointCount: 1,
                dashboardCount: 1,
                readonly: false,
            },
            endpoints: [
                {
                    endpointId: "products",
                    method: "GET",
                    targetUrl: "https://example.test/products",
                    params: [
                        { name: "q", in: "query", type: "string" },
                        { name: "status", in: "query", type: "string" },
                    ],
                },
            ],
            dashboards: [dashboard],
        };
        const root = document.createElement("div");

        mountDashboardWidgets(
            root,
            [widget],
            {
                group,
                dashboard,
                selectedRows: new Map(),
                drafts: new Map(),
                filters: new Map([["productsTable", { q: "racket", status: "published" }]]),
            },
            "root",
            new Map(),
            null,
        );

        const wrapper = root.querySelector<HTMLElement>("[cms-source]")!;
        const source = new URL(wrapper.getAttribute("cms-source")!.split(" as ")[0]!, window.location.origin);
        expect(Object.fromEntries(source.searchParams)).toEqual({
            q: "racket",
            status: "published",
            limit: "100",
        });
        expect(root.querySelector("cms-dashboard-w-table")?.getAttribute("data-filters-json")).toBe(
            '{"q":"racket","status":"published"}',
        );
    });

    test("loads selection-scoped evidence for the owning claim and not for an evidence detail", async () => {
        const requests: string[] = [];
        globalThis.fetch = (async (input: RequestInfo | URL) => {
            requests.push(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
            return Response.json({ items: [] });
        }) as unknown as typeof fetch;
        const dashboard = claimEvidenceDashboard();
        const group = claimEvidenceSourceGroup(dashboard);
        const claim = { collection: "claimDetail", row: "claim-42" };
        const root = document.createElement("div");

        mountDashboardWidgets(
            root,
            widgetsForSelection(dashboard, claim),
            { group, dashboard, selectedRows: new Map(), drafts: new Map() },
            "root",
            new Map(),
            claim,
        );
        document.body.append(root);
        await waitFor(() => requests.some((url) => sourceEndpoint(url) === "claimEvidenceItems"));

        const evidenceRequest = new URL(
            requests.find((url) => sourceEndpoint(url) === "claimEvidenceItems")!,
            window.location.origin,
        );
        expect(evidenceRequest.searchParams.get("claimId")).toBe("claim-42");
        expect(evidenceRequest.searchParams.get("limit")).toBe("100");

        root.remove();
        requests.length = 0;
        const evidence = { collection: "claimEvidenceDetail", row: "evidence-7" };
        const evidenceRoot = document.createElement("div");
        mountDashboardWidgets(
            evidenceRoot,
            widgetsForSelection(dashboard, evidence),
            { group, dashboard, selectedRows: new Map(), drafts: new Map() },
            "root",
            new Map(),
            evidence,
        );
        document.body.append(evidenceRoot);
        await waitFor(() => requests.some((url) => sourceEndpoint(url) === "claimEvidenceItem"));

        expect(requests.some((url) => sourceEndpoint(url) === "claimEvidenceItems")).toBeFalse();
    });
});

function claimEvidenceDashboard(): DashboardDto {
    return {
        id: "payments",
        source: "commerce",
        views: [
            {
                widget: "w-table",
                id: "claimsTable",
                source: { endpoint: "claims", itemsPath: "items" },
                rowKey: "id",
                columns: [{ id: "id", label: "ID", path: "id", primary: true }],
                selection: { opens: "claimDetail" },
            },
            {
                widget: "w-detail",
                id: "claimDetail",
                source: { endpoint: "claim", params: { id: "$selection.id" } },
                main: [],
            },
            {
                widget: "w-table",
                id: "claimEvidenceTable",
                source: {
                    endpoint: "claimEvidenceItems",
                    params: { claimId: "$selection.claimDetail.id", limit: "100" },
                    itemsPath: "items",
                },
                rowKey: "id",
                columns: [{ id: "id", label: "ID", path: "id", primary: true }],
                selection: { opens: "claimEvidenceDetail" },
            },
            {
                widget: "w-detail",
                id: "claimEvidenceDetail",
                source: { endpoint: "claimEvidenceItem", params: { id: "$selection.id" } },
                main: [],
            },
        ],
    };
}

function claimEvidenceSourceGroup(dashboard: DashboardDto): DashboardSourceGroup {
    return {
        source: {
            urn: "urn:commerce",
            id: "commerce",
            name: "Commerce",
            endpointCount: 4,
            dashboardCount: 1,
            readonly: false,
        },
        endpoints: [
            {
                endpointId: "claims",
                method: "GET",
                targetUrl: "https://example.test/claims",
                params: [],
            },
            {
                endpointId: "claim",
                method: "GET",
                targetUrl: "https://example.test/claim",
                params: [{ name: "id", in: "query", type: "string", required: true }],
            },
            {
                endpointId: "claimEvidenceItems",
                method: "GET",
                targetUrl: "https://example.test/claim-evidence",
                params: [{ name: "claimId", in: "query", type: "string", required: true }],
            },
            {
                endpointId: "claimEvidenceItem",
                method: "GET",
                targetUrl: "https://example.test/claim-evidence-item",
                params: [{ name: "id", in: "query", type: "string", required: true }],
            },
        ],
        dashboards: [dashboard],
    };
}

function sourceEndpoint(url: string): string {
    return new URL(url, window.location.origin).pathname.split("/").at(-1) ?? "";
}

async function waitFor(predicate: () => boolean, timeout = 1_000): Promise<void> {
    const started = Date.now();
    while (!predicate()) {
        if (Date.now() - started > timeout) {
            throw new Error("Timed out waiting for dashboard source state");
        }
        await new Promise((resolve) => setTimeout(resolve, 5));
    }
}
