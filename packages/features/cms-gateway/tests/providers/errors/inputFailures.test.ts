import { parseStrictJson } from "@bernouy/cms-repository/contracts/protocol";
import { expect, test } from "bun:test";
import {
    createProviderContractRelay,
    compileProviderRoutes,
    DefaultProviderCapabilityDispatcher,
} from "@bernouy/cms-gateway/provider/server";
import { admitContractRelease, resolveContract } from "@bernouy/cms-repository/contracts";
import { SchemaValueError } from "@bernouy/cms-repository/contracts/schema";
import { InMemoryReleaseCatalogue } from "@bernouy/cms-repository/contracts/catalogue";
import { inputFailureResponse, encodeRequestContext, REQUEST_CONTEXT_HEADER } from "@bernouy/cms-gateway/protocol";
import { NOOP_LOGGER } from "@bernouy/logging";
import { gatewayRoute } from "../../fixtures";

test("independent Provider SDK schema refusals are localized, bounded and occur before the handler", async () => {
    const route = await gatewayRoute();
    const admission = await admitContractRelease({ ...route.release.admission.release, contractId: "example.catalog" });
    const catalogue = new InMemoryReleaseCatalogue();
    await catalogue.publish(admission);
    const resolved = await resolveContract(catalogue, admission);
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    let calls = 0;
    dispatcher.register("example.catalog", "item.list", async () => {
        calls++;
        return { items: [] };
    });
    const relay = createProviderContractRelay(
        compileProviderRoutes([resolved]),
        dispatcher,
        { siteId: "site-a", providerId: "independent" },
        NOOP_LOGGER,
    );
    const requestId = crypto.randomUUID();
    const response = (await relay(
        new Request(`https://provider.test/v1/items?term=${"x".repeat(51)}`, {
            headers: {
                "x-ulvia-request-id": requestId,
                "accept-language": "en",
                [REQUEST_CONTEXT_HEADER]: encodeRequestContext({ headers: { "accept-language": "fr" } }),
            },
        }),
        {
            version: 1,
            requestId,
            instanceId: "instance-a",
            contractId: "example.catalog",
            contractVersion: "1.0.0",
            capabilityId: "item.list",
            issuedAt: 0,
            expiresAt: 9999999999,
        },
    ))!;
    expect(response.status).toBe(400);
    expect(response.headers.get("content-language")).toBe("fr");
    expect(await response.json()).toHaveProperty("failure.output.message");
    expect(calls).toBe(0);
});

test("invalid-input explanations honor authoritative empty context, redact diagnostics and keep HEAD bodyless", async () => {
    const diagnostic = new Error("password=do-not-expose");
    for (const method of ["POST", "HEAD"]) {
        const request = new Request("https://provider.test/input", {
            method,
            headers: {
                "accept-language": "fr",
                [REQUEST_CONTEXT_HEADER]: encodeRequestContext({ headers: {} }),
            },
        });
        const response = inputFailureResponse(request, 400, diagnostic, "request-a", true);
        expect(response.headers.get("content-language")).toBe("en");
        const body = await response.text();
        expect(body).not.toContain("password");
        expect(body.length > 0).toBe(method !== "HEAD");
    }
    const huge = new SchemaValueError("private diagnostic", "$." + "a\n".repeat(4096));
    const response = inputFailureResponse(new Request("https://provider.test/input"), 400, huge);
    expect((await response.text()).length).toBeLessThan(600);
    const unicode = inputFailureResponse(
        new Request("https://provider.test/input"),
        400,
        new SchemaValueError("private diagnostic", "$.a" + "😀".repeat(200)),
    );
    const encoded = await unicode.text();
    expect(() => parseStrictJson(encoded, 4096, 8)).not.toThrow();
    const tooLarge = inputFailureResponse(
        new Request("https://provider.test/input", { headers: { "accept-language": "fr" } }),
        413,
    );
    expect(tooLarge.status).toBe(413);
    expect(await tooLarge.json()).toMatchObject({ failure: { code: "payload_too_large" } });
});
