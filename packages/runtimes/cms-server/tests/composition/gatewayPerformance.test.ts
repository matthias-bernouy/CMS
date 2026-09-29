import { expect, test } from "bun:test";
import type { EndpointPerformanceObservation, EndpointPerformanceRecorder } from "@bernouy/cms-analytics";
import { GatewayError, type GatewayInvoker } from "@bernouy/cms-gateway";
import { observeGatewayInvoker } from "../../src/runtime/gateway/observeGatewayInvoker";

const invocation = {
    siteId: "site-main",
    contractId: "commerce",
    capabilityId: "product.get",
    input: { slug: "chair" },
    origin: "delivery" as const,
    actor: { kind: "anonymous" as const },
};

test("gateway invocation performance preserves results and records bounded endpoint metrics", async () => {
    const observations: EndpointPerformanceObservation[] = [];
    const recorder: EndpointPerformanceRecorder = {
        observe(value) {
            observations.push(value);
        },
    };
    const invoker: GatewayInvoker = {
        invoke: async () => ({ kind: "success", requestId: "request-1", status: 200, output: { slug: "chair" } }),
    };
    const observed = observeGatewayInvoker(invoker, recorder, "delivery");

    expect(await observed.invoke(invocation)).toMatchObject({ kind: "success", status: 200 });
    expect(observations).toMatchObject([
        { surface: "delivery", endpointUrn: "urn:commerce:product.get", method: "POST", status: 200 },
    ]);
    expect(observations[0]?.stagesMs.cms_total).toBeGreaterThanOrEqual(0);
});

test("gateway invocation performance records failed authorization without changing the error", async () => {
    const observations: EndpointPerformanceObservation[] = [];
    const failure = new GatewayError("not_authorized", "denied");
    const observed = observeGatewayInvoker(
        {
            invoke: async () => {
                throw failure;
            },
        },
        {
            observe(value) {
                observations.push(value);
            },
        },
        "control",
    );

    await expect(observed.invoke(invocation)).rejects.toBe(failure);
    expect(observations).toMatchObject([{ surface: "control", status: 403 }]);
});
