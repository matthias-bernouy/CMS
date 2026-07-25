import { describe, expect, test } from "bun:test";
import {
    composeSourceEndpointInterceptors,
    type SourceEndpoint,
    type SourceEndpointInterceptor,
} from "@bernouy/cms-sources";

const endpoint: SourceEndpoint = {
    urn: "urn:test:image",
    method: "GET",
    targetUrl: "https://example.test/image",
    output: [{ status: "200" }],
};

describe("composeSourceEndpointInterceptors", () => {
    test("returns undefined for an empty optional composition", () => {
        expect(composeSourceEndpointInterceptors(undefined, null)).toBeUndefined();
    });

    test("preserves one interceptor by identity", () => {
        const interceptor: SourceEndpointInterceptor = async (_endpoint, request, next) => next(request);
        expect(composeSourceEndpointInterceptors(undefined, interceptor)).toBe(interceptor);
    });

    test("runs interceptors outer-to-inner in declaration order", async () => {
        const events: string[] = [];
        const interceptor =
            (name: string): SourceEndpointInterceptor =>
            async (_endpoint, request, next) => {
                events.push(`${name}:before`);
                const response = await next(request);
                events.push(`${name}:after:${response.status}`);
                return response;
            };
        const composed = composeSourceEndpointInterceptors(interceptor("trigger"), interceptor("image"))!;
        const response = await composed(endpoint, new Request("https://cms.test/image"), async () => {
            events.push("dispatch");
            return new Response("ok");
        });
        expect(response.status).toBe(200);
        expect(events).toEqual(["trigger:before", "image:before", "dispatch", "image:after:200", "trigger:after:200"]);
    });

    test("keeps an outer trigger active when the inner image layer returns a cache hit", async () => {
        const events: string[] = [];
        const trigger: SourceEndpointInterceptor = async (_endpoint, request, next) => {
            events.push("trigger:before");
            const response = await next(request);
            events.push(`trigger:response:${await response.clone().text()}`);
            return response;
        };
        const imageHit: SourceEndpointInterceptor = async () => {
            events.push("image:hit");
            return new Response("cached");
        };
        const composed = composeSourceEndpointInterceptors(trigger, imageHit)!;
        const response = await composed(endpoint, new Request("https://cms.test/image"), async () => {
            throw new Error("dispatch must be bypassed");
        });
        expect(await response.text()).toBe("cached");
        expect(events).toEqual(["trigger:before", "image:hit", "trigger:response:cached"]);
    });

    test("forwards the request chosen by each layer to the next layer", async () => {
        const rewrite =
            (name: string, value: string): SourceEndpointInterceptor =>
            async (_endpoint, request, next) => {
                const url = new URL(request.url);
                url.searchParams.set(name, value);
                return next(new Request(url, request));
            };
        const composed = composeSourceEndpointInterceptors(rewrite("first", "1"), rewrite("second", "2"))!;
        const response = await composed(endpoint, new Request("https://cms.test/image"), async (request) =>
            Response.json(Object.fromEntries(new URL(request.url).searchParams)),
        );
        expect(await response.json()).toEqual({ first: "1", second: "2" });
    });
});
