import { expect, test } from "bun:test";
import { ProviderCapabilityDispatchError } from "@bernouy/cms-gateway/provider/server";
import { HttpGatewayTransport } from "@bernouy/cms-gateway/http";
import { validateResponse } from "@bernouy/cms-gateway/testing";
import { gatewayResultResponse } from "@bernouy/cms-gateway/testing";
import { fixture, details } from "./fixture";

test.each(["throw", "response"])(
    "one provider projects %s errors for three selected releases and retains Content-Language",
    async (mode) => {
        const f = await fixture();
        f.dispatcher.register("ulvia/catalog", "item.list", async (_input, context) => {
            expect(context.http.headers.get("accept-language")).toBe("es");
            if (mode === "throw") {
                throw new ProviderCapabilityDispatchError(
                    "NOT_FOUND",
                    404,
                    "Invalid page",
                    { "content-language": "es" },
                    details,
                );
            }
            return Response.json(
                { error: { code: "NOT_FOUND", output: details } },
                { status: 404, headers: { "content-language": "es" } },
            );
        });
        f.mount();
        const expected = [
            undefined,
            { message: details.message },
            { message: details.message, issues: details.issues },
        ];
        for (const [index, request] of f.requests.entries()) {
            const result = validateResponse(request.capability, await f.transport.send(request), request.requestId);
            expect(result).toMatchObject({ kind: "declared-error", errorCode: "NOT_FOUND", retryable: false });
            const response = gatewayResultResponse(result, "GET");
            expect(response.status).toBe(404);
            expect(response.headers.get("content-language")).toBe("es");
            expect(await response.json()).toEqual({
                error: { code: "NOT_FOUND", retryable: false, ...(expected[index] ? { output: expected[index] } : {}) },
            });
        }
        expect(f.count()).toBe(3);
    },
);

test("the Gateway also projects richer errors from a provider without the SDK", async () => {
    const f = await fixture();
    const transport = new HttpGatewayTransport({
        network: {
            exchange: async () => Response.json({ error: { code: "NOT_FOUND", output: details } }, { status: 404 }),
        },
    });
    for (const [index, request] of f.requests.entries()) {
        const result = validateResponse(request.capability, await transport.send(request), request.requestId);
        expect(result).toMatchObject({ kind: "declared-error", errorCode: "NOT_FOUND" });
        expect(result.kind === "declared-error" ? result.output : null).toEqual(
            index === 0
                ? undefined
                : index === 1
                  ? { message: details.message }
                  : { message: details.message, issues: details.issues },
        );
    }
});

test("SDK and Gateway retain validation of required error fields, bounds, codes and statuses", async () => {
    const f = await fixture();
    let output: unknown;
    let code = "NOT_FOUND";
    let status = 404;
    f.dispatcher.register("ulvia/catalog", "item.list", async () => {
        throw new ProviderCapabilityDispatchError(code, status, "Invalid page", {}, output);
    });
    f.mount();
    for (const candidate of [undefined, {}, { message: 42 }, { message: "x".repeat(129) }, details]) {
        output = candidate;
        if (candidate === details) {
            code = "UNKNOWN";
        }
        const request = f.requests[1]!;
        await expect(f.transport.send(request)).rejects.toMatchObject({ code: "invalid_provider_response" });
        const external = new HttpGatewayTransport({
            network: { exchange: async () => Response.json({ error: { code, output } }, { status }) },
        });
        await expect(external.send(request)).rejects.toMatchObject({ code: "invalid_provider_response" });
    }
    code = "NOT_FOUND";
    status = 422;
    await expect(f.transport.send(f.requests[1]!)).rejects.toMatchObject({ code: "invalid_provider_response" });
});
