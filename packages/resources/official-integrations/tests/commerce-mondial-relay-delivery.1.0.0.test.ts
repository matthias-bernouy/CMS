import { describe, expect, test } from "bun:test";
import {
    importIntegration,
    InMemoryIntegrationInstallationRepository,
} from "@bernouy/cms-integrations";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { executeFunction, InMemoryFunctionRepository, validateFunction } from "@bernouy/cms-functions";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";
import { InMemoryRolesRepository, USER_ROLE } from "@bernouy/cms-permissions";
import {
    InMemorySourceRepository,
    makeEndpointUrn,
    makeSourceUrn,
    type Source,
} from "@bernouy/cms-sources";

describe("commerce-mondial-relay-delivery 1.0.0", () => {
    test("verifies order ownership and stores only a server-validated relay selection", async () => {
        const sources = new InMemorySourceRepository();
        const functions = new InMemoryFunctionRepository();
        const installations = new InMemoryIntegrationInstallationRepository();
        const roles = new InMemoryRolesRepository();
        await sources.createSource(commerceSource());
        await sources.createSource(deliverySource());
        await sources.createSource(accountsSource());
        await seedInstallation(installations, "commerce");
        await seedInstallation(installations, "mondial-relay");
        await seedInstallation(installations, "user-account");

        const definition = await new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT)
            .get("commerce-mondial-relay-delivery");
        if (!definition) throw new Error("commerce-mondial-relay-delivery definition not found");
        const result = await importIntegration(
            { sources, functions, installations, roles },
            { kind: "commerce-mondial-relay-delivery", answers: {}, options: {} },
            [definition],
        );
        expect(result.artifacts).toEqual([
            { type: "function", id: "setRelayPointForOrder", action: "created" },
            { type: "function", id: "getRelayPointForOrder", action: "created" },
        ]);

        const fn = await functions.getFunction("setRelayPointForOrder");
        if (!fn) throw new Error("setRelayPointForOrder function not imported");
        expect(await validateFunction(fn, { sources })).toEqual([]);
        expect((await roles.get(USER_ROLE))?.grants.map(grant => grant.permission)).toEqual(expect.arrayContaining([
            "urn:system-functions:setRelayPointForOrder",
            "urn:system-functions:getRelayPointForOrder",
        ]));

        let deliveryBody: unknown;
        const response = await executeFunction(fn, new Request("https://cms.test/functions/setRelayPointForOrder", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({
                orderId: "42",
                relayLocation: "FR-024474",
                country: "FR",
                postalCode: "75001",
                city: "Paris",
            }),
        }), {
            sources,
            user: { id: "buyer-subject", role: "user" },
            deps: {
                fetchImpl: async (input, init) => {
                    const request = new Request(input, init);
                    if (request.url.startsWith("https://commerce.test")) {
                        if (request.url.includes("quote-authorization")) {
                            return Response.json({
                                orderId: 42, orderPublicId: "order-public-42", orderVersion: 1,
                                status: "awaiting_quote", buyerCmsUserId: "buyer-subject",
                                sellerCmsUserId: "seller-subject", currency: "eur",
                                merchandiseSubtotalMinorAmount: 1000,
                                shippingAddress: {
                                    recipient: "Alice Buyer", phone: "+33600000000",
                                    addressLine1: "1 rue du Test", postalCode: "75001", city: "Paris", countryCode: "FR",
                                },
                            });
                        }
                        if (request.url.includes("financial-lock")) {
                            return Response.json({ orderId: 42, deliveryQuoteId: `mrq_${"a".repeat(64)}`, shippingAmount: 450, buyerTotalAmount: 1550, currency: "eur", financialTermsHash: "terms-42" });
                        }
                        return Response.json({
                            id: 42,
                            publicId: "order-public-42",
                            buyerCmsUserId: "buyer-subject",
                            status: "awaiting_quote",
                            version: 1,
                        });
                    }
                    if (request.url.startsWith("https://accounts.test")) {
                        return Response.json({
                            givenName: "Seller", surname: "Test", phone: "+33611111111",
                            addressLine1: "2 rue du Vendeur", postalCode: "69001", city: "Lyon", countryCode: "FR",
                        });
                    }
                    if (request.url.includes("/resolve")) {
                        return Response.json(deliveryQuote(true));
                    }
                    deliveryBody = await request.json();
                    expect(request.headers.get("x-cms-user-id")).toBe("buyer-subject");
                    return Response.json(deliveryQuote(false));
                },
            },
        });

        expect(response.status).toBe(200);
        expect(deliveryBody).toEqual({
            requestKey: "commerce-order:order-public-42:version:1:relay:FR-024474",
            externalOrderId: "order-public-42",
            orderVersion: 1,
            selectedForCmsUserId: "buyer-subject",
            relayLocation: "FR-024474",
            country: "FR",
            postalCode: "75001",
            city: "Paris",
            currency: "eur",
            merchandiseSubtotalMinorAmount: 1000,
            recipientSnapshot: {
                recipient: "Alice Buyer", phone: "+33600000000", addressLine1: "1 rue du Test",
                postalCode: "75001", city: "Paris", countryCode: "FR",
            },
            sellerFulfillmentSnapshot: {
                givenName: "Seller", surname: "Test", phone: "+33611111111",
                addressLine1: "2 rue du Vendeur", postalCode: "69001", city: "Lyon", countryCode: "FR",
            },
        });
        expect(await response.json()).toMatchObject({
            selection: {
                externalOrderId: "order-public-42",
                relayLocation: "FR-024474",
                name: "RELAIS G20 RUE REAUMUR",
                nature: "1",
                pointType: "relay_point",
                weightGrams: 500,
                shippingAmount: 450,
            },
            financialTerms: { deliveryQuoteId: `mrq_${"a".repeat(64)}`, shippingAmount: 450, buyerTotalAmount: 1550 },
        });
    });

    test("rejects relay selection for another buyer before calling Delivery", async () => {
        const { sources, functions } = await importedHarness();
        const fn = await functions.getFunction("setRelayPointForOrder");
        if (!fn) throw new Error("setRelayPointForOrder function not imported");
        let deliveryCalled = false;
        const response = await executeFunction(fn, new Request("https://cms.test/functions/setRelayPointForOrder", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ orderId: "42", relayLocation: "FR-024474", country: "FR", postalCode: "75001" }),
        }), {
            sources,
            user: { id: "stranger", role: "user" },
            deps: {
                fetchImpl: async input => {
                    const request = new Request(input);
                    if (request.url.startsWith("https://commerce.test")) {
                        return Response.json({ id: 42, publicId: "order-public-42", buyerCmsUserId: "buyer-subject", status: "awaiting_quote" });
                    }
                    deliveryCalled = true;
                    return Response.json({});
                },
            },
        });

        expect(response.status).toBe(403);
        expect(await response.json()).toEqual({ error: "Order does not belong to the current buyer" });
        expect(deliveryCalled).toBe(false);
    });

    test("never locks financial terms when buyer or seller fulfillment data is incomplete", async () => {
        for (const incomplete of ["buyer", "seller"] as const) {
            const { sources, functions } = await importedHarness();
            const fn = await functions.getFunction("setRelayPointForOrder");
            if (!fn) throw new Error("setRelayPointForOrder function not imported");
            let financialLockCalled = false;
            const response = await executeFunction(fn, new Request("https://cms.test/functions/setRelayPointForOrder", {
                method: "POST", headers: { "content-type": "application/json" },
                body: JSON.stringify({ orderId: "42", relayLocation: "FR-024474", country: "FR", postalCode: "75001" }),
            }), {
                sources, user: { id: "buyer-subject", role: "user" }, deps: { fetchImpl: async (input, init) => {
                    const request = new Request(input, init);
                    const path = new URL(request.url).pathname;
                    if (path === "/order") return Response.json({
                        id: 42, publicId: "order-public-42", buyerCmsUserId: "buyer-subject", status: "awaiting_quote", version: 1,
                    });
                    if (path === "/quote-authorization") return Response.json({
                        orderId: 42, orderPublicId: "order-public-42", orderVersion: 1, status: "awaiting_quote",
                        buyerCmsUserId: "buyer-subject", sellerCmsUserId: "seller-subject", currency: "eur",
                        merchandiseSubtotalMinorAmount: 1000,
                        shippingAddress: incomplete === "buyer"
                            ? { recipient: "Buyer", phone: "+33600000000", addressLine1: "1 rue", postalCode: "75001", countryCode: "FR" }
                            : { recipient: "Buyer", phone: "+33600000000", addressLine1: "1 rue", postalCode: "75001", city: "Paris", countryCode: "FR" },
                    });
                    if (path === "/account") return Response.json(incomplete === "seller"
                        ? { givenName: "Seller", surname: "Name", phone: "+33611111111", addressLine1: "", postalCode: "69001", city: "Lyon", countryCode: "FR" }
                        : { givenName: "Seller", surname: "Name", phone: "+33611111111", addressLine1: "2 rue", postalCode: "69001", city: "Lyon", countryCode: "FR" });
                    if (path === "/relay-selection") return Response.json({ error: `${incomplete} fulfillment profile is incomplete` }, { status: 409 });
                    if (path === "/financial-lock") financialLockCalled = true;
                    return Response.json({});
                } },
            });

            expect(response.status).toBeGreaterThanOrEqual(400);
            expect(financialLockCalled).toBe(false);
        }
    });
});

async function importedHarness() {
    const sources = new InMemorySourceRepository();
    const functions = new InMemoryFunctionRepository();
    const installations = new InMemoryIntegrationInstallationRepository();
    const roles = new InMemoryRolesRepository();
    await sources.createSource(commerceSource());
    await sources.createSource(deliverySource());
    await sources.createSource(accountsSource());
    await seedInstallation(installations, "commerce");
    await seedInstallation(installations, "mondial-relay");
    await seedInstallation(installations, "user-account");
    const definition = await new FsIntegrationDefinitionRepository(OFFICIAL_INTEGRATIONS_ROOT)
        .get("commerce-mondial-relay-delivery");
    if (!definition) throw new Error("commerce-mondial-relay-delivery definition not found");
    await importIntegration(
        { sources, functions, installations, roles },
        { kind: "commerce-mondial-relay-delivery", answers: {}, options: {} },
        [definition],
    );
    return { sources, functions };
}

function commerceSource(): Source {
    return {
        urn: makeSourceUrn("commerce"),
        endpoints: [{
            urn: makeEndpointUrn("commerce", "myOrder"),
            method: "GET",
            targetUrl: "https://commerce.test/order",
            headers: [{ name: "x-cms-user-id", source: { from: "computed", ref: "userID" } }],
            input: { params: [{ name: "id", in: "query", schema: { type: "string" } }] },
            output: [{ status: "200", body: {
                type: "object",
                properties: {
                    publicId: { type: "string" },
                    buyerCmsUserId: { type: "string" },
                    status: { type: "string" },
                    version: { type: "number" },
                    financialTerms: { type: "object", properties: { deliveryQuoteId: { type: "string" } } },
                },
            } }],
        }, {
            urn: makeEndpointUrn("commerce", "getOrderDeliveryQuoteAuthorization"),
            method: "GET",
            targetUrl: "https://commerce.test/quote-authorization",
            headers: [{ name: "x-cms-user-id", source: { from: "computed", ref: "userID" } }],
            input: { params: [{ name: "orderPublicId", in: "query", schema: { type: "string" } }] },
            output: [{ status: "200", body: { type: "object", properties: {
                orderId: { type: "number" }, orderPublicId: { type: "string" }, orderVersion: { type: "number" },
                status: { type: "string" },
                buyerCmsUserId: { type: "string", semantic: { kind: "user-id", authority: "cms" } },
                sellerCmsUserId: { type: "string", semantic: { kind: "user-id", authority: "cms" } },
                currency: { type: "string" }, merchandiseSubtotalMinorAmount: { type: "number" }, shippingAddress: { type: "object" },
            } } }],
        }, {
            urn: makeEndpointUrn("commerce", "lockOrderFinancialTerms"),
            method: "POST",
            targetUrl: "https://commerce.test/financial-lock",
            headers: [{ name: "x-cms-user-id", source: { from: "computed", ref: "userID" } }],
            input: { body: { type: "object", properties: {
                orderPublicId: { type: "string" }, deliveryQuoteId: { type: "string" }, shippingAmount: { type: "number" },
                currency: { type: "string" }, expectedVersion: { type: "number" },
            } } },
            output: [{ status: "200", body: { type: "object" } }],
        }],
    };
}

function deliverySource(): Source {
    const selectionBody = {
        type: "object" as const,
        properties: {
            requestKey: { type: "string" as const },
            purpose: { type: "string" as const },
            externalOrderId: { type: "string" as const },
            orderVersion: { type: "number" as const },
            revision: { type: "number" as const },
            quoteId: { type: "string" as const },
            selectedForCmsUserId: {
                type: "string" as const,
                semantic: { kind: "user-id" as const, authority: "cms" },
            },
            relayLocation: { type: "string" as const },
            country: { type: "string" as const },
            number: { type: "string" as const },
            name: { type: "string" as const },
            addressLine1: { type: "string" as const },
            addressLine2: { type: "string" as const },
            postalCode: { type: "string" as const },
            city: { type: "string" as const },
            nature: { type: "string" as const },
            pointType: { type: "string" as const },
            weightGrams: { type: "number" as const },
            shippingAmount: { type: "number" as const },
            currency: { type: "string" as const },
            merchandiseSubtotalMinorAmount: { type: "number" as const },
            recipientSnapshot: { type: "object" as const },
            sellerFulfillmentSnapshot: { type: "object" as const },
            quotedAt: { type: "string" as const },
            expiresAt: { type: "string" as const },
        },
    };
    return {
        urn: makeSourceUrn("delivery"),
        endpoints: [
            {
                urn: makeEndpointUrn("delivery", "saveRelaySelection"),
                method: "POST",
                targetUrl: "https://delivery.test/relay-selection",
                headers: [{ name: "x-cms-user-id", source: { from: "computed", ref: "userID" } }],
                input: { body: selectionBody },
                output: [
                    { status: "200", body: selectionBody },
                    { status: "409", body: { type: "object", properties: { error: { type: "string" } } } },
                ],
            },
            {
                urn: makeEndpointUrn("delivery", "resolveDeliveryQuote"),
                method: "POST",
                targetUrl: "https://delivery.test/resolve",
                input: { body: selectionBody },
                output: [{ status: "200", body: selectionBody }],
            },
            {
                urn: makeEndpointUrn("delivery", "deliveryQuote"), method: "GET",
                targetUrl: "https://delivery.test/public",
                input: { params: [
                    { name: "quoteId", in: "query", schema: { type: "string" } },
                    { name: "externalOrderId", in: "query", schema: { type: "string" } },
                    {
                        name: "selectedForCmsUserId",
                        in: "query",
                        schema: { type: "string", semantic: { kind: "user-id", authority: "cms" } },
                    },
                ] },
                output: [{ status: "200", body: selectionBody }],
            },
        ],
    };
}

function accountsSource(): Source {
    return {
        urn: makeSourceUrn("accounts"),
        endpoints: [{
            urn: makeEndpointUrn("accounts", "getAccountByUserId"), method: "GET",
            targetUrl: "https://accounts.test/account",
            input: { params: [{
                name: "userId",
                in: "query",
                schema: { type: "string", semantic: { kind: "user-id", authority: "cms" } },
            }] },
            output: [{ status: "200", body: { type: "object" } }],
        }],
    };
}

function deliveryQuote(includePrivate: boolean): Record<string, unknown> {
    return {
        quoteId: `mrq_${"a".repeat(64)}`, externalOrderId: "order-public-42", orderVersion: 1, revision: 1,
        selectedForCmsUserId: "buyer-subject", relayLocation: "FR-024474", country: "FR", number: "024474",
        name: "RELAIS G20 RUE REAUMUR", addressLine1: "85 rue Réaumur", addressLine2: "",
        nature: "1", pointType: "relay_point",
        postalCode: "75002", city: "PARIS", weightGrams: 500, shippingAmount: 450, currency: "eur",
        merchandiseSubtotalMinorAmount: 1000, quotedAt: "2026-07-13T10:00:00.000Z", expiresAt: "2099-07-13T10:15:00.000Z",
        ...(includePrivate ? {
            recipientSnapshot: { name: "Alice Buyer", phone: "+33600000000", addressLine1: "1 rue du Test", addressLine2: "", addressLine3: "", postalCode: "75001", city: "Paris", country: "FR", email: "" },
            sellerFulfillmentSnapshot: { name: "Seller Test", firstName: "Seller", lastName: "Test", phone: "+33611111111", addressLine1: "2 rue du Vendeur", addressLine2: "", addressLine3: "", postalCode: "69001", city: "Lyon", country: "FR", email: "" },
        } : {}),
    };
}

async function seedInstallation(
    installations: InMemoryIntegrationInstallationRepository,
    id: "commerce" | "mondial-relay" | "user-account",
): Promise<void> {
    await installations.create({
        id,
        label: id,
        definitionVersion: "1.0.0",
        status: "success",
        answersSnapshot: { id: id === "mondial-relay" ? "delivery" : id === "user-account" ? "accounts" : id },
        secretRefs: {},
        secretInputs: [],
        artifacts: [{ type: "source", id: `urn:${id === "mondial-relay" ? "delivery" : id === "user-account" ? "accounts" : id}`, action: "created" }],
        runs: [],
    });
}
