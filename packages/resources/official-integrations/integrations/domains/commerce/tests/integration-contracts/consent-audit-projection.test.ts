import { expect, test } from "bun:test";
import { resolve } from "node:path";
import { executeFunction, type CmsFunction } from "@bernouy/cms-functions";
import { resolveTemplates, type IntegrationDefinition } from "@bernouy/cms-integrations";
import { InMemorySourceRepository, sourceDtoToSource } from "@bernouy/cms-sources";
import { handleCommerceRequest } from "../../connectors/supabase/functions/cms-commerce/handler.ts";
import { loadIntegrationDefinition } from "../../../../../tests/helpers/integrationDefinition";
import {
    commerceApiKey,
    expectRpc,
    installCommerceTestEnvironment,
    jsonResponse,
    setRestResponder,
    supabaseUrl,
} from "../harness";
import { consentReceipt, consentUrl, correlationId, versionId } from "../protected/payment/buyer-legal-fixtures";

installCommerceTestEnvironment();

test.each(["getBuyerLegalAcceptanceAudit", "getMyBuyerLegalAcceptanceAudit"])(
    "%s projects Consent receipt identity and preserves historical evidence through the function/Source/Edge pipeline",
    async (endpointId) => {
        const definition = await loadIntegrationDefinition<IntegrationDefinition>(
            resolve(import.meta.dir, "../../definition.json"),
        );
        const sourceArtifact = definition.artifacts!.find((artifact) => artifact.type === "source");
        if (sourceArtifact?.type !== "source") {
            throw new Error("Commerce Source missing");
        }
        const endpoint = sourceArtifact.source.endpoints.find((item) => item.endpointId === endpointId)!;
        const sources = new InMemorySourceRepository();
        await sources.createSource(
            sourceDtoToSource(
                resolveTemplates(
                    { ...sourceArtifact.source, endpoints: [endpoint] },
                    {
                        answers: {},
                        secrets: { cmsApiKey: "${COMMERCE_AUTH}" },
                        connectors: { supabase: { functionsBaseUrl: `${supabaseUrl}/functions/v1` } },
                    },
                ),
            ),
        );
        const page = { id: "terms-page", path: "/terms", title: "Terms", description: "", content: "<p>Terms</p>" };
        const legacy = {
            key: "legacy-terms",
            label: "Legacy terms",
            consentText: "Accepted legacy terms",
            pageUrl: "/terms",
            page,
            versionId: "8d341928-b30d-4af5-b918-eab9df624706",
            versionDate: "2026-09-01T08:00:00Z",
            contentHash: "d".repeat(64),
            acceptedAt: "2026-09-01T09:00:00Z",
            correlationId,
        };
        const receipt = consentReceipt({
            documents: [
                {
                    documentKey: "terms",
                    versionId,
                    contentHash: "c".repeat(64),
                    label: "Terms",
                    consentText: "I accept the Terms",
                    page,
                    pageUrl: "/terms",
                    versionDate: "2026-09-06T08:00:00Z",
                },
            ],
        });
        setRestResponder(async (request) => {
            if (request.url.endsWith("/rpc/get_buyer_legal_acceptance_audit")) {
                return jsonResponse({
                    orderId: 42,
                    orderPublicId: "order-public-42",
                    checkoutGroupId: "checkout-42",
                    buyerCmsUserId: "buyer-17",
                    paymentAttemptIds: [8],
                    acceptances: [legacy],
                    consentReferences: [
                        {
                            contextKey: receipt.contextKey,
                            operationKey: receipt.operationKey,
                            acceptanceId: receipt.acceptanceId,
                            correlationId,
                            paymentAttemptId: 8,
                        },
                    ],
                });
            }
            expect(request.url).toBe(`${consentUrl}/operations/receipt`);
            expect(request.headers.get("authorization")).toBe("Bearer consent-api-key");
            expect(await request.json()).toEqual({
                contextKey: "buyer_checkout",
                operationKey: receipt.operationKey,
                cmsUserId: "buyer-17",
            });
            return jsonResponse({ receipt });
        });
        const fn: CmsFunction = {
            id: "auditReceipt",
            method: "GET",
            access: { mode: "auth" },
            steps: [{ id: "audit", call: { source: "commerce", endpoint: endpointId, params: { orderId: 42 } } }],
            return: { status: 200, body: "$steps.audit" },
        };
        const role = endpointId === "getBuyerLegalAcceptanceAudit" ? "admin" : "user";
        const response = await executeFunction(fn, new Request("https://cms.test/audit"), {
            sources,
            user: { id: "buyer-17", role },
            deps: {
                resolveContext: async () => ({ userID: "buyer-17", userRole: role }),
                resolveSecret: async () => commerceApiKey,
                fetchImpl: async (input, init) => handleCommerceRequest(new Request(input, init)),
            },
        });
        expect(response.status).toBe(200);
        const audit = await response.json();
        expect(audit).toMatchObject({
            orderId: 42,
            buyerCmsUserId: "buyer-17",
            checkoutGroupId: "checkout-42",
            paymentAttemptIds: [8],
        });
        expect(audit.consentReferences).toBeUndefined();
        expect(audit.acceptances).toHaveLength(2);
        expect(audit.acceptances[0]).toEqual(legacy);
        expect(audit.acceptances[1]).toMatchObject({
            acceptanceId: receipt.acceptanceId,
            contextKey: "buyer_checkout",
            correlationId,
            versionId,
            contentHash: "c".repeat(64),
            acceptedAt: receipt.acceptedAt,
            page,
        });
        expect(expectRpc("get_buyer_legal_acceptance_audit").body.p_buyer_cms_user_id).toBe(
            role === "admin" ? null : "buyer-17",
        );
    },
);
