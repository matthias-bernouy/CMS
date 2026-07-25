import { describe, expect, test } from "bun:test";
import { connectorRequest, installConnectorHarness, requests, response, setResponder } from "./harness";

installConnectorHarness();

describe("sales-configurator connector authorization", () => {
    test("rejects an invalid integration secret before touching Supabase", async () => {
        const result = await connectorRequest("/partner/proposals", {
            key: "wrong",
            userId: "partner-a",
        });

        expect(result.status).toBe(401);
        expect(requests()).toHaveLength(0);
    });

    test("requires the exact CMS admin role and trusted actor", async () => {
        for (const userRole of ["user", "sales-partner", "support"]) {
            const result = await connectorRequest("/admin/proposals", {
                userId: "actor",
                userRole,
            });
            expect(result.status).toBe(403);
        }
        const missingActor = await connectorRequest("/admin/proposals", { userRole: "admin" });
        expect(missingActor.status).toBe(401);
        expect(requests()).toHaveLength(0);
    });

    test("denies authenticated users without an active partner account", async () => {
        setResponder(() => response([]));
        const result = await connectorRequest("/partner/proposals", {
            userId: "ordinary-user",
        });

        expect(result.status).toBe(403);
        expect(await result.json()).toEqual({ error: "active sales partner account required" });
    });

    test("checks integration-owned capabilities", async () => {
        setResponder((request) => {
            const path = new URL(request.url).pathname;
            if (path.endsWith("/partner_accounts")) {
                return response([{ id: 7, cms_user_id: "partner-a", display_name: "Partner A" }]);
            }
            return response([]);
        });
        const result = await connectorRequest("/partner/proposal?id=42", {
            userId: "partner-a",
        });

        expect(result.status).toBe(403);
        expect(await result.json()).toEqual({
            error: "partner capability required: proposals.manage",
        });
    });

    test("projects the published catalogue into modules, variants, and contextual features", async () => {
        setResponder((request) => {
            const path = new URL(request.url).pathname;
            if (path.endsWith("/partner_accounts")) {
                return response([{ id: 7, cms_user_id: "partner-a", display_name: "Partner A" }]);
            }
            if (path.endsWith("/catalog_items")) {
                return response([
                    {
                        id: 10,
                        kind: "module",
                        code: "booking",
                        name: "Booking",
                        status: "published",
                        sort_order: 1,
                    },
                    {
                        id: 11,
                        kind: "variant",
                        code: "restaurant",
                        name: "Restaurant",
                        status: "published",
                        sort_order: 1,
                    },
                    {
                        id: 12,
                        kind: "feature",
                        code: "payment",
                        name: "Online payment",
                        status: "published",
                        sort_order: 2,
                    },
                ]);
            }
            if (path.endsWith("/catalog_modules")) {
                return response([{ item_id: 10 }]);
            }
            if (path.endsWith("/catalog_variants")) {
                return response([
                    {
                        item_id: 11,
                        module_item_id: 10,
                        provider_name: "Internal",
                        pricing_mode: "fixed",
                        unit_amount_cents: 50000,
                        currency: "EUR",
                    },
                ]);
            }
            if (path.endsWith("/catalog_features")) {
                return response([{ item_id: 12 }]);
            }
            if (path.endsWith("/variant_features")) {
                return response([
                    {
                        variant_item_id: 11,
                        feature_item_id: 12,
                        availability: "optional",
                        pricing_mode: "fixed",
                        unit_amount_cents: 15000,
                    },
                ]);
            }
            if (path.endsWith("/catalog_requirements")) {
                return response([]);
            }
            throw new Error(`unexpected request ${request.url}`);
        });
        const result = await connectorRequest("/partner/catalog", {
            userId: "partner-a",
        });

        expect(result.status).toBe(200);
        expect(await result.json()).toEqual({
            modules: [
                {
                    id: 10,
                    code: "booking",
                    name: "Booking",
                    requirements: [],
                    variants: [
                        {
                            id: 11,
                            code: "restaurant",
                            name: "Restaurant",
                            providerName: "Internal",
                            pricingMode: "fixed",
                            unitAmountCents: 50000,
                            currency: "EUR",
                            features: [
                                {
                                    id: 12,
                                    code: "payment",
                                    name: "Online payment",
                                    availability: "optional",
                                    pricingMode: "fixed",
                                    unitAmountCents: 15000,
                                    currency: "EUR",
                                    requirements: [],
                                },
                            ],
                            requirements: [],
                        },
                    ],
                },
            ],
        });
    });

    test("derives proposal ownership from the CMS header, never from input", async () => {
        setResponder((request) => {
            const path = new URL(request.url).pathname;
            if (path.endsWith("/partner_accounts")) {
                return response([{ id: 7, cms_user_id: "partner-a", display_name: "Partner A" }]);
            }
            if (path.endsWith("/partner_capabilities")) {
                return response([{ partner_account_id: 7, capability: "proposals.manage" }]);
            }
            if (path.endsWith("/rpc/save_partner_proposal_draft")) {
                return response({ state: "ok", proposal: { id: 42 } });
            }
            throw new Error(`unexpected request ${request.url}`);
        });
        const result = await connectorRequest("/partner/proposal/draft", {
            userId: "partner-a",
            body: {
                ownerCmsUserId: "partner-b",
                clientId: 8,
                title: "Restaurant booking",
                selections: [
                    JSON.stringify({
                        variantItemId: 12,
                        optionalFeatureItemIds: [15, 16],
                    }),
                ],
                customRequests: [
                    JSON.stringify({
                        label: "Custom reporting",
                        quantity: 1,
                    }),
                ],
            },
        });

        expect(result.status).toBe(200);
        const rpc = requests().find((request) => request.url.pathname.endsWith("/rpc/save_partner_proposal_draft"));
        expect(rpc?.body).toMatchObject({
            p_actor_cms_user_id: "partner-a",
            p_client_id: 8,
            p_selections: [
                {
                    variantItemId: 12,
                    optionalFeatureItemIds: [15, 16],
                },
            ],
            p_custom_items: [
                {
                    label: "Custom reporting",
                    description: null,
                    quantity: 1,
                },
            ],
        });
        expect(JSON.stringify(rpc?.body)).not.toContain("partner-b");
    });

    test("normalizes cross-partner proposal reads as not found", async () => {
        setResponder((request) => {
            const path = new URL(request.url).pathname;
            if (path.endsWith("/partner_accounts")) {
                return response([{ id: 7, cms_user_id: "partner-a", display_name: "Partner A" }]);
            }
            if (path.endsWith("/partner_capabilities")) {
                return response([{ partner_account_id: 7, capability: "proposals.manage" }]);
            }
            return response({ state: "not_found" });
        });
        const result = await connectorRequest("/partner/proposal?id=42", {
            userId: "partner-a",
        });

        expect(result.status).toBe(404);
        expect(await result.json()).toEqual({ error: "proposal not found" });
    });

    test("returns structured missing prerequisites without mutating a draft", async () => {
        setResponder((request) => {
            const path = new URL(request.url).pathname;
            if (path.endsWith("/partner_accounts")) {
                return response([{ id: 7, cms_user_id: "partner-a", display_name: "Partner A" }]);
            }
            if (path.endsWith("/partner_capabilities")) {
                return response([{ partner_account_id: 7, capability: "proposals.manage" }]);
            }
            return response({
                state: "invalid",
                code: "missing_requirements",
                missing_requirements: [
                    {
                        subject_item_id: 12,
                        required_item_id: 20,
                        required_kind: "module",
                    },
                ],
            });
        });
        const result = await connectorRequest("/partner/proposal/draft", {
            userId: "partner-a",
            body: {
                clientId: 8,
                selections: [
                    {
                        variantItemId: 12,
                        optionalFeatureItemIds: [],
                    },
                ],
                customRequests: [],
            },
        });

        expect(result.status).toBe(422);
        expect(await result.json()).toEqual({
            error: "proposal prerequisites are incomplete",
            code: "missing_requirements",
            missingRequirements: [
                {
                    subjectItemId: 12,
                    requiredItemId: 20,
                    requiredKind: "module",
                },
            ],
        });
    });

    test("protects publish against a stale draft version", async () => {
        setResponder((request) => {
            const path = new URL(request.url).pathname;
            if (path.endsWith("/partner_accounts")) {
                return response([{ id: 7, cms_user_id: "partner-a", display_name: "Partner A" }]);
            }
            if (path.endsWith("/partner_capabilities")) {
                return response([{ partner_account_id: 7, capability: "proposals.publish" }]);
            }
            return response({ state: "conflict", code: "draft_version_changed" });
        });
        const result = await connectorRequest("/partner/proposal/publish", {
            userId: "partner-a",
            body: {
                proposalId: 42,
                expectedVersionId: 9,
                expectedRevision: 3,
            },
        });

        expect(result.status).toBe(409);
        expect(await result.json()).toEqual({
            error: "proposal draft changed; reload before publishing",
            code: "draft_version_changed",
        });
        const rpc = requests().find((request) => request.url.pathname.endsWith("/rpc/publish_partner_proposal"));
        expect(rpc?.body).toMatchObject({
            p_actor_cms_user_id: "partner-a",
            p_proposal_id: 42,
            p_expected_version_id: 9,
            p_expected_revision: 3,
        });
    });

    test("derives the administrative audit actor from trusted headers", async () => {
        await connectorRequest("/admin/proposal/transition", {
            userId: "admin-a",
            userRole: "admin",
            body: {
                proposalId: 42,
                status: "accepted",
                actorCmsUserId: "spoofed-admin",
            },
        });
        const rpc = requests().find((request) => request.url.pathname.endsWith("/rpc/transition_admin_proposal"));

        expect(rpc?.body).toEqual({
            p_actor_cms_user_id: "admin-a",
            p_proposal_id: 42,
            p_status: "accepted",
        });
    });

    test("never persists a raw share token", async () => {
        setResponder((request) => {
            const path = new URL(request.url).pathname;
            if (path.endsWith("/partner_accounts")) {
                return response([{ id: 7, cms_user_id: "partner-a", display_name: "Partner A" }]);
            }
            if (path.endsWith("/partner_capabilities")) {
                return response([{ partner_account_id: 7, capability: "proposals.share" }]);
            }
            if (path.endsWith("/rpc/create_partner_proposal_share")) {
                return response({
                    state: "ok",
                    proposal: { id: 42 },
                    share: { id: 3, proposalVersionId: 9, viewCount: 0 },
                });
            }
            throw new Error(`unexpected request ${request.url}`);
        });
        const result = await connectorRequest("/partner/proposal/share", {
            userId: "partner-a",
            body: { proposalId: 42 },
        });
        const payload = (await result.json()) as Record<string, unknown>;
        const rpc = requests().find((request) => request.url.pathname.endsWith("/rpc/create_partner_proposal_share"));

        expect(result.status).toBe(200);
        expect(payload.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
        expect(result.headers.get("cache-control")).toBe("private, no-store");
        expect(rpc?.body.p_token_hash).toMatch(/^[a-f0-9]{64}$/);
        expect(JSON.stringify(rpc?.body)).not.toContain(String(payload.token));
    });

    test("normalizes unavailable public tokens and disables caching", async () => {
        const result = await connectorRequest("/shared-proposal?token=invalid");

        expect(result.status).toBe(404);
        expect(await result.json()).toEqual({ error: "shared proposal unavailable" });
        expect(result.headers.get("cache-control")).toBe("private, no-store");
        expect(requests()).toHaveLength(0);
    });

    test("projects public proposal reads through an explicit field allowlist", async () => {
        setResponder(() =>
            response({
                state: "ok",
                proposal: {
                    reference: "PROP-42",
                    status: "shared",
                    title: "Booking",
                    introduction: "Client copy",
                    ownerCmsUserId: "must-not-leak",
                    privateNotes: "must-not-leak",
                    version: {
                        versionNumber: 2,
                        currency: "EUR",
                        fixedTotalCents: 65000,
                        quoteItemCount: 1,
                        publishedAt: "2026-07-25T12:00:00.000Z",
                        client: {
                            companyName: "Bistro",
                            contactName: "Camille",
                            contactEmail: "must-not-leak@example.test",
                        },
                        salesContact: {
                            displayName: "Partner A",
                            contactEmail: "sales@example.test",
                            internalPhone: "must-not-leak",
                        },
                        items: [
                            {
                                kind: "variant",
                                origin: "selected",
                                label: "Restaurant booking",
                                quantity: 1,
                                pricingMode: "fixed",
                                unitAmountCents: 50000,
                                currency: "EUR",
                                sortOrder: 0,
                                catalogItemId: 99,
                                metadata: { internal: true },
                            },
                        ],
                    },
                    events: [{ metadata: { secret: true } }],
                    tokenHash: "must-not-leak",
                },
            }),
        );
        const result = await connectorRequest(`/shared-proposal?token=${"a".repeat(43)}`);
        const payload = await result.json();
        const serialized = JSON.stringify(payload);

        expect(result.status).toBe(200);
        expect(payload).toMatchObject({
            proposal: {
                reference: "PROP-42",
                publishedAt: "2026-07-25T12:00:00.000Z",
                salesContact: {
                    displayName: "Partner A",
                    email: "sales@example.test",
                },
                items: [{ depth: 0 }],
            },
        });
        for (const privateValue of ["must-not-leak", "catalogItemId", "metadata", "events", "tokenHash"]) {
            expect(serialized).not.toContain(privateValue);
        }
        expect(result.headers.get("cache-control")).toBe("private, no-store");
    });
});
