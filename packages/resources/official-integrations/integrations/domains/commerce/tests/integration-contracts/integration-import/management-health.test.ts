import { beforeEach, describe, expect, test } from "bun:test";

import {
    capturedFetches,
    installCommerceTestEnvironment,
    jsonResponse,
    requestCommerce,
    setRestResponder,
} from "../../harness";

installCommerceTestEnvironment();

let buyerCheckoutReady = true;
let configurationReady = true;
let databaseReady = true;

describe("Commerce management health", () => {
    beforeEach(() => {
        buyerCheckoutReady = true;
        configurationReady = true;
        databaseReady = true;
        setRestResponder(healthResponder);
    });

    test("checks database invariants and current buyer checkout consent documents", async () => {
        const response = await requestCommerce("/management", {
            body: { operation: "health" },
        });

        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({
            schemaVersion: 1,
            status: "ready",
            configuration: { savedRevision: "7", appliedRevision: "7" },
            checks: expect.arrayContaining([
                { id: "commerceConfiguration", status: "ok", code: "commerce_configuration_available" },
                expect.objectContaining({ id: "database", status: "ok" }),
                expect.objectContaining({ id: "consentService", status: "ok" }),
                expect.objectContaining({
                    id: "buyerCheckoutConsent",
                    status: "ok",
                    code: "buyer_checkout_consent_ready",
                }),
            ]),
        });
        expect(capturedFetches().map((call) => call.url)).toContain(
            "https://project.supabase.co/functions/v1/cms-consent/admin/context?context=buyer_checkout",
        );
    });

    test("blocks health when buyer checkout has no published current document", async () => {
        buyerCheckoutReady = false;

        const response = await requestCommerce("/management", {
            body: { operation: "health" },
        });

        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({
            status: "blocked",
            checks: expect.arrayContaining([
                {
                    id: "buyerCheckoutConsent",
                    status: "error",
                    code: "buyer_checkout_consent_documents_missing",
                    message: "Enable buyer_checkout and publish at least one current consent document",
                },
            ]),
        });
    });

    test("reports a blocked result instead of failing when Commerce configuration is unavailable", async () => {
        configurationReady = false;

        const response = await requestCommerce("/management", {
            body: { operation: "health" },
        });

        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({
            status: "blocked",
            configuration: { savedRevision: null, appliedRevision: null },
            checks: expect.arrayContaining([
                {
                    id: "commerceConfiguration",
                    status: "error",
                    code: "commerce_configuration_unavailable",
                    message: "The active Commerce configuration could not be loaded",
                },
            ]),
        });
    });

    test("reports a blocked result instead of failing when database health is unavailable", async () => {
        databaseReady = false;

        const response = await requestCommerce("/management", {
            body: { operation: "health" },
        });

        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({
            status: "blocked",
            checks: expect.arrayContaining([
                {
                    id: "database",
                    status: "error",
                    code: "commerce_database_unavailable",
                    message: "Commerce database health could not be verified",
                },
            ]),
        });
    });
});

function healthResponder(request: Request): Response {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/rest/v1/settings")) {
        return configurationReady ? jsonResponse([{ version: 7 }]) : jsonResponse({ message: "unavailable" }, 503);
    }
    if (url.pathname.endsWith("/rest/v1/rpc/application_health")) {
        return databaseReady
            ? jsonResponse({
                  status: "ready",
                  checks: [{ id: "database", status: "ok", code: "database_available" }],
              })
            : jsonResponse({ message: "unavailable" }, 503);
    }
    if (url.pathname.endsWith("/cms-consent/management")) {
        return jsonResponse({ schemaVersion: 1, status: "ready" });
    }
    if (url.pathname.endsWith("/cms-consent/admin/context")) {
        return jsonResponse({
            contextKey: "buyer_checkout",
            enabled: true,
            documents: buyerCheckoutReady
                ? [
                      {
                          enabled: true,
                          versionId: "version-1",
                          contentHash: "a".repeat(64),
                          publishedSnapshotUrl: "https://cms.example.test/legal/terms",
                      },
                  ]
                : [],
        });
    }
    return jsonResponse({ message: "unexpected health request" }, 500);
}
