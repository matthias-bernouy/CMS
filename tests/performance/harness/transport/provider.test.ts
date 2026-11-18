import { expect, test } from "bun:test";
import { inventoryFixture } from "../../fixtures/inventory";
import { providerRequest } from "./provider";

test("Provider clients preserve compiled binding and exact authority headers without a Gateway prefix", async () => {
    const { target } = await inventoryFixture();
    const requestId = crypto.randomUUID();
    const request = providerRequest("http://localhost:8080", target, "http", {}, { token: "local-only" }, requestId);
    expect(request.url.href).toBe("http://localhost:8080/read");
    expect(request.init.method).toBe("GET");
    expect(request.init.headers.get("x-ulvia-request-id")).toBe(requestId);
    expect(request.init.headers.get("x-ulvia-contract-id")).toBe(target.release.contractId);
    expect(request.init.headers.get("x-ulvia-contract-version")).toBe(target.release.version);
    expect(request.init.headers.get("x-ulvia-capability-id")).toBe(target.definition.id);
    expect(request.init.headers.get("authorization")).toBe("Bearer local-only");
    for (const credentials of [{}, { cookie: "ordinary-session" }, { token: "local-only", cookie: "session" }]) {
        expect(() => providerRequest("http://localhost", target, "http", {}, credentials, requestId)).toThrow();
    }
    expect(() => providerRequest("https://ulvia.fr", target, "http", {}, { token: "local-only" }, requestId)).toThrow();
    expect(() => providerRequest("http://localhost", target, "http", {}, { token: "local-only" }, "bad-id")).toThrow();
    expect(() =>
        providerRequest("http://localhost", target, "http", { injected: true }, { token: "local-only" }, requestId),
    ).toThrow();
});
