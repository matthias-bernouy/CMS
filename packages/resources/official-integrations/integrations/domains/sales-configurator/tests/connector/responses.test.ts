import { describe, expect, test } from "bun:test";
import { connectorRequest, installConnectorHarness, requests, response, setResponder } from "./harness";

installConnectorHarness();

describe("sales-configurator connector response contracts", () => {
    test("preserves a valid opaque CMS user id byte-for-byte", async () => {
        const sentinel = "local:AbC-123_./+@example";
        setResponder((request) => {
            const path = new URL(request.url).pathname;
            if (path.endsWith("/rpc/upsert_partner_account")) {
                return response({ state: "ok", partner: { id: 7 } });
            }
            if (path.endsWith("/partner_accounts")) {
                return response([
                    {
                        id: 7,
                        cms_user_id: sentinel,
                        status: "active",
                        display_name: "Partner sentinel",
                    },
                ]);
            }
            if (path.endsWith("/partner_capabilities")) {
                return response([]);
            }
            throw new Error(`unexpected request ${request.url}`);
        });

        const result = await connectorRequest("/admin/partner", {
            userId: "admin-a",
            userRole: "admin",
            body: {
                cmsUserId: sentinel,
                displayName: "Partner sentinel",
                status: "active",
            },
        });
        const rpc = requests().find((request) => request.url.pathname.endsWith("/rpc/upsert_partner_account"));

        expect(result.status).toBe(200);
        expect(rpc?.body.p_cms_user_id).toBe(sentinel);
        expect((await result.json()).cmsUserId).toBe(sentinel);
    });

    test("rejects padded and control-bearing CMS user ids without normalization", async () => {
        for (const cmsUserId of [" local:sentinel ", "local:line\nbreak"]) {
            const result = await connectorRequest("/admin/partner", {
                userId: "admin-a",
                userRole: "admin",
                body: {
                    cmsUserId,
                    displayName: "Partner sentinel",
                    status: "active",
                },
            });

            expect(result.status).toBe(400);
            expect(await result.json()).toEqual({ error: "cmsUserId is invalid" });
        }
        expect(requests()).toEqual([]);
    });

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
                        companyRegistrationNumber: "FR-123456789",
                        contactName: "Camille",
                        contactJobTitle: "Owner",
                        contactEmail: "camille@example.test",
                        contactPhone: "+33 1 23 45 67 89",
                        addressLine1: "12 rue du Test",
                        addressLine2: null,
                        postalCode: "75001",
                        city: "Paris",
                        country: "France",
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
                companyRegistrationNumber: "FR-123456789",
                contactName: "Camille",
                contactJobTitle: "Owner",
                contactEmail: "camille@example.test",
                contactPhone: "+33 1 23 45 67 89",
                addressLine1: "12 rue du Test",
                addressLine2: "",
                postalCode: "75001",
                city: "Paris",
                country: "France",
            },
        });
        const rpc = requests().find((request) => request.url.pathname.endsWith("/rpc/save_partner_client"));

        expect(result.status).toBe(200);
        expect(await result.json()).toEqual({
            id: 8,
            companyName: "Bistro",
            companyRegistrationNumber: "FR-123456789",
            contactName: "Camille",
            contactJobTitle: "Owner",
            contactEmail: "camille@example.test",
            contactPhone: "+33 1 23 45 67 89",
            addressLine1: "12 rue du Test",
            addressLine2: null,
            postalCode: "75001",
            city: "Paris",
            country: "France",
        });
        expect(rpc?.body.p_partner_account_id).toBe(7);
        expect(rpc?.body.p_payload).toMatchObject({
            company_registration_number: "FR-123456789",
            contact_job_title: "Owner",
            address_line1: "12 rue du Test",
            address_line2: null,
            postal_code: "75001",
            city: "Paris",
            country: "France",
        });
        expect(JSON.stringify(rpc?.body)).not.toContain("partner-b");
        expect(JSON.stringify(rpc?.body)).not.toContain("partner-a");
    });

    test("lists enriched client profiles and searches their business identity", async () => {
        setResponder((request) => {
            const path = new URL(request.url).pathname;
            if (path.endsWith("/partner_accounts")) {
                return response([{ id: 7, cms_user_id: "partner-a", display_name: "Partner A" }]);
            }
            if (path.endsWith("/partner_capabilities")) {
                return response([{ partner_account_id: 7, capability: "clients.manage" }]);
            }
            if (path.endsWith("/clients")) {
                return response([
                    {
                        id: 8,
                        company_name: "Bistro",
                        company_registration_number: "FR-123456789",
                        contact_name: "Camille",
                        contact_job_title: "Owner",
                        contact_email: "camille@example.test",
                        contact_phone: null,
                        address_line1: "12 rue du Test",
                        address_line2: null,
                        postal_code: "75001",
                        city: "Paris",
                        country: "France",
                        notes: null,
                    },
                ]);
            }
            throw new Error(`unexpected request ${request.url}`);
        });

        const result = await connectorRequest("/partner/clients?q=FR-123", {
            userId: "partner-a",
        });
        const payload = (await result.json()) as { items: Record<string, unknown>[] };
        const listRequest = requests().find((request) => request.url.pathname.endsWith("/clients"));

        expect(result.status).toBe(200);
        expect(payload.items[0]).toMatchObject({
            companyName: "Bistro",
            companyRegistrationNumber: "FR-123456789",
            contactJobTitle: "Owner",
            addressLine1: "12 rue du Test",
            postalCode: "75001",
            city: "Paris",
            country: "France",
        });
        expect(listRequest?.url.searchParams.get("select")).toContain("company_registration_number");
        expect(listRequest?.url.searchParams.get("select")).toContain("contact_job_title");
        expect(listRequest?.url.searchParams.get("or")).toContain("company_registration_number.ilike.*FR-123*");
        expect(listRequest?.url.searchParams.get("or")).toContain("city.ilike.*FR-123*");
    });

    test("redacts audit actor ids from every partner proposal event", async () => {
        setResponder((request) => {
            const path = new URL(request.url).pathname;
            if (path.endsWith("/partner_accounts")) {
                return response([{ id: 7, cms_user_id: "partner-a", display_name: "Partner A" }]);
            }
            if (path.endsWith("/partner_capabilities")) {
                return response([{ partner_account_id: 7, capability: "proposals.manage" }]);
            }
            if (path.endsWith("/rpc/read_partner_proposal")) {
                return response({
                    state: "ok",
                    proposal: {
                        id: 42,
                        events: [
                            {
                                id: 1,
                                eventType: "created",
                                actorType: "partner",
                                actorId: "7",
                                metadata: {},
                            },
                            {
                                id: 2,
                                eventType: "status_changed",
                                actorType: "admin",
                                actorId: "local:admin-secret",
                                metadata: {},
                            },
                        ],
                    },
                });
            }
            throw new Error(`unexpected request ${request.url}`);
        });

        const result = await connectorRequest("/partner/proposal?id=42", {
            userId: "partner-a",
        });
        const payload = (await result.json()) as {
            proposal: { events: Record<string, unknown>[] };
        };

        expect(result.status).toBe(200);
        expect(payload.proposal.events).toEqual([
            { id: 1, eventType: "created", actorType: "partner", metadata: {} },
            { id: 2, eventType: "status_changed", actorType: "admin", metadata: {} },
        ]);
        expect(JSON.stringify(payload)).not.toContain("local:admin-secret");
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
                        partner_account_id: 7,
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
                        partner_account_id: 7,
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
                        client_company_registration_number: "FR-FROZEN",
                        client_contact_name: "Frozen contact",
                        client_contact_job_title: "Director",
                        client_contact_email: "frozen@example.test",
                        client_contact_phone: null,
                        client_address_line1: "1 Frozen street",
                        client_address_line2: null,
                        client_postal_code: "75001",
                        client_city: "Paris",
                        client_country: "France",
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
                clientSnapshot: {
                    companyName: string;
                    companyRegistrationNumber: string;
                    contactJobTitle: string;
                    city: string;
                };
                salesContact: { displayName: string };
            };
        };

        expect(result.status).toBe(200);
        expect(body.currentVersion).toMatchObject({
            title: "Frozen title",
            clientSnapshot: {
                companyName: "Frozen client",
                companyRegistrationNumber: "FR-FROZEN",
                contactJobTitle: "Director",
                city: "Paris",
            },
            salesContact: { displayName: "Frozen partner" },
        });
        const versionRequest = requests().find((request) => request.url.pathname.endsWith("/proposal_versions"));
        expect(versionRequest?.url.searchParams.get("select")).toContain("client_company_name");
        expect(versionRequest?.url.searchParams.get("select")).toContain("client_company_registration_number");
        expect(versionRequest?.url.searchParams.get("select")).toContain("client_city");
        expect(versionRequest?.url.searchParams.get("select")).toContain("sales_contact_name");
    });

    test("treats malformed public projections as unavailable", async () => {
        setResponder(() => response({ state: "ok", proposal: { reference: "SC-42" } }));

        const result = await connectorRequest(`/shared-proposal?token=${"a".repeat(43)}`);

        expect(result.status).toBe(404);
        expect(result.headers.get("cache-control")).toBe("private, no-store");
    });
});
