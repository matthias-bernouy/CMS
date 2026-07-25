import { describe, expect, test } from "bun:test";
import { connectorRequest, installConnectorHarness, requests, response, setResponder } from "./harness";

installConnectorHarness();

describe("sales-configurator connector response contracts", () => {
    test("unwraps catalogue command envelopes into the declared entity", async () => {
        setResponder((request) => {
            if (new URL(request.url).pathname.endsWith("/rpc/upsert_catalog_module")) {
                return response({
                    state: "ok",
                    module: {
                        id: 12,
                        code: "booking",
                        name: "Booking",
                        status: "published",
                        sortOrder: 1,
                    },
                });
            }
            throw new Error(`unexpected request ${request.url}`);
        });

        const result = await connectorRequest("/admin/module", {
            userId: "admin-a",
            userRole: "admin",
            body: {
                code: "booking",
                name: "Booking",
                status: "published",
                sortOrder: 1,
            },
        });

        expect(result.status).toBe(200);
        expect(await result.json()).toEqual({
            id: 12,
            code: "booking",
            name: "Booking",
            status: "published",
            sortOrder: 1,
        });
    });

    test("unwraps a client save and always injects the trusted owner", async () => {
        setResponder((request) => {
            const path = new URL(request.url).pathname;
            if (path.endsWith("/partner_accounts")) {
                return response([{ id: 7, cms_user_id: "partner-a", display_name: "Partner A" }]);
            }
            if (path.endsWith("/partner_capabilities")) {
                return response([{ partner_account_id: 7, capability: "clients.manage" }]);
            }
            if (path.endsWith("/rpc/save_partner_client")) {
                return response({
                    state: "ok",
                    client: {
                        id: 8,
                        companyName: "Bistro",
                        contactName: "Camille",
                        contactEmail: "camille@example.test",
                    },
                });
            }
            throw new Error(`unexpected request ${request.url}`);
        });

        const result = await connectorRequest("/partner/client", {
            userId: "partner-a",
            body: {
                ownerCmsUserId: "partner-b",
                companyName: "Bistro",
                contactName: "Camille",
                contactEmail: "camille@example.test",
            },
        });
        const rpc = requests().find((request) => request.url.pathname.endsWith("/rpc/save_partner_client"));

        expect(result.status).toBe(200);
        expect(await result.json()).toEqual({
            id: 8,
            companyName: "Bistro",
            contactName: "Camille",
            contactEmail: "camille@example.test",
        });
        expect(rpc?.body.p_actor_cms_user_id).toBe("partner-a");
        expect(JSON.stringify(rpc?.body)).not.toContain("partner-b");
    });

    test("normalizes RPC not-found and conflict states to HTTP errors", async () => {
        setResponder((request) => {
            const path = new URL(request.url).pathname;
            if (path.endsWith("/partner_accounts")) {
                return response([{ id: 7, cms_user_id: "partner-a", display_name: "Partner A" }]);
            }
            if (path.endsWith("/partner_capabilities")) {
                return response([{ partner_account_id: 7, capability: "proposals.share" }]);
            }
            if (path.endsWith("/rpc/create_partner_proposal_share")) {
                return response({ state: "conflict", code: "proposal_is_not_published" });
            }
            throw new Error(`unexpected request ${request.url}`);
        });

        const share = await connectorRequest("/partner/proposal/share", {
            userId: "partner-a",
            body: { proposalId: 42 },
        });

        expect(share.status).toBe(409);
        expect(await share.json()).toEqual({ error: "proposal_is_not_published" });
    });

    test("rejects malformed successful proposal RPC payloads", async () => {
        setResponder((request) => {
            const path = new URL(request.url).pathname;
            if (path.endsWith("/partner_accounts")) {
                return response([{ id: 7, cms_user_id: "partner-a", display_name: "Partner A" }]);
            }
            if (path.endsWith("/partner_capabilities")) {
                return response([{ partner_account_id: 7, capability: "proposals.share" }]);
            }
            if (path.endsWith("/rpc/create_partner_proposal_share")) {
                return response({ state: "ok", id: 3 });
            }
            throw new Error(`unexpected request ${request.url}`);
        });

        const result = await connectorRequest("/partner/proposal/share", {
            userId: "partner-a",
            body: { proposalId: 42 },
        });

        expect(result.status).toBe(502);
        expect(await result.json()).toEqual({ error: "invalid proposal response" });
    });

    test("does not hide a rejected admin transition behind a successful refetch", async () => {
        setResponder((request) => {
            if (new URL(request.url).pathname.endsWith("/rpc/transition_admin_proposal")) {
                return response({ state: "conflict", code: "invalid_status_transition" });
            }
            throw new Error(`unexpected request ${request.url}`);
        });

        const result = await connectorRequest("/admin/proposal/transition", {
            userId: "admin-a",
            userRole: "admin",
            body: { proposalId: 42, status: "accepted" },
        });

        expect(result.status).toBe(409);
        expect(await result.json()).toEqual({ error: "invalid_status_transition" });
        expect(requests()).toHaveLength(1);
    });

    test("hydrates frozen version headers in administrative history", async () => {
        setResponder((request) => {
            const path = new URL(request.url).pathname;
            if (path.endsWith("/proposals")) {
                return response([
                    {
                        id: 42,
                        owner_cms_user_id: "partner-a",
                        client_id: 8,
                        reference: "SC-42",
                        status: "draft",
                        title: "Live title",
                    },
                ]);
            }
            if (path.endsWith("/clients")) {
                return response([
                    {
                        id: 8,
                        owner_cms_user_id: "partner-a",
                        company_name: "Live client",
                        contact_name: "Live contact",
                        contact_email: "live@example.test",
                    },
                ]);
            }
            if (path.endsWith("/proposal_versions")) {
                return response([
                    {
                        id: 9,
                        proposal_id: 42,
                        version_number: 1,
                        revision: 2,
                        state: "published",
                        currency: "EUR",
                        fixed_total_cents: 50000,
                        quote_item_count: 0,
                        public_title: "Frozen title",
                        public_introduction: "Frozen introduction",
                        client_company_name: "Frozen client",
                        client_contact_name: "Frozen contact",
                        client_contact_email: "frozen@example.test",
                        client_contact_phone: null,
                        sales_contact_name: "Frozen partner",
                        sales_contact_email: "partner@example.test",
                    },
                ]);
            }
            if (path.endsWith("/partner_accounts")) {
                return response([
                    {
                        id: 7,
                        cms_user_id: "partner-a",
                        status: "active",
                        display_name: "Live partner",
                    },
                ]);
            }
            return response([]);
        });

        const result = await connectorRequest("/admin/proposal?id=42", {
            userId: "admin-a",
            userRole: "admin",
        });
        const body = (await result.json()) as {
            currentVersion: {
                title: string;
                clientSnapshot: { companyName: string };
                salesContact: { displayName: string };
            };
        };

        expect(result.status).toBe(200);
        expect(body.currentVersion).toMatchObject({
            title: "Frozen title",
            clientSnapshot: { companyName: "Frozen client" },
            salesContact: { displayName: "Frozen partner" },
        });
        const versionRequest = requests().find((request) => request.url.pathname.endsWith("/proposal_versions"));
        expect(versionRequest?.url.searchParams.get("select")).toContain("client_company_name");
        expect(versionRequest?.url.searchParams.get("select")).toContain("sales_contact_name");
    });

    test("treats malformed public projections as unavailable", async () => {
        setResponder(() => response({ state: "ok", proposal: { reference: "SC-42" } }));

        const result = await connectorRequest(`/shared-proposal?token=${"a".repeat(43)}`);

        expect(result.status).toBe(404);
        expect(result.headers.get("cache-control")).toBe("private, no-store");
    });
});
