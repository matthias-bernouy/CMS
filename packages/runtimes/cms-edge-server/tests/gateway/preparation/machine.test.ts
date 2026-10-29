import { expect, test } from "bun:test";
import { preparedFixture } from "./fixture";
import { createCapabilityHttpHandler } from "@bernouy/cms-gateway/http/handlers";
const token = "opaque-provider-credential-" + "a".repeat(32);
const invocation = {
    siteId: "default",
    contractId: "catalog",
    capabilityId: "item.list",
    input: { term: "test" },
    actor: { kind: "anonymous" as const },
};

test("machine authentication, authorization and signing use one control call before real pinned HTTP dispatch", async () => {
    const f = await preparedFixture(false, undefined, true);
    try {
        expect(await f.gateway.invokeProvider!(token, invocation)).toMatchObject({
            kind: "success",
            output: { items: ["authorized"] },
        });
        expect(f.events).toEqual(["machine-prepare", "business"]);
        expect(f.preparations[0]).toMatchObject({ token, invocation: { contractId: "catalog", bodyBytes: 15 } });
        expect(f.preparations[0]).not.toHaveProperty("actor");
        expect(f.preparations[0]!.invocation).not.toHaveProperty("sourceInstallationId");
        expect(f.preparations[0]!.invocation.trace.spanId).toBe(f.preparations[0]!.invocation.requestId);
    } finally {
        f.close();
    }
});
test("the machine HTTP adapter uses the combined broker and never resolves a claimed Provider identity", async () => {
    const f = await preparedFixture(false, undefined, true);
    try {
        const handler = createCapabilityHttpHandler({
            siteId: "default",
            basePath: "/",
            invoker: f.gateway.invoker,
            invokeProvider: f.gateway.invokeProvider,
            resolveActor: async () => {
                throw new Error("No browser actor");
            },
            authenticateProvider: async () => {
                throw new Error("No separate authentication call");
            },
        });
        const response = await handler(
            new Request("https://site.test/.cms/call/catalog/v1/items?term=test", {
                headers: { authorization: `Bearer ${token}`, "x-ulvia-provider-authority": "provider" },
            }),
        );
        expect(response.status).toBe(200);
        expect(f.events).toEqual(["machine-prepare", "business"]);
    } finally {
        f.close();
    }
});
test("machine commands retain verified source before audit, audit before dispatch and purge after dispatch", async () => {
    let purges = 0;
    const f = await preparedFixture(
        true,
        () => {
            purges++;
        },
        true,
    );
    try {
        await f.gateway.invokeProvider!(token, invocation);
        expect(f.events).toEqual(["machine-prepare", "started", "business", "completed"]);
        expect(purges).toBe(1);
        f.deny();
        await expect(f.gateway.invokeProvider!(token, invocation)).rejects.toMatchObject({ code: "not_authorized" });
        expect(purges).toBe(1);
    } finally {
        f.close();
    }
});
test("another instance, delegated ticket, wrong audience and invalid input cannot dispatch machine business", async () => {
    const f = await preparedFixture(false, undefined, true);
    try {
        for (const value of [
            { ...invocation, siteId: "another-instance" },
            { ...invocation, delegationTicket: "t".repeat(43) },
        ]) {
            await expect(f.gateway.invokeProvider!(token, value)).rejects.toMatchObject({ code: "not_authorized" });
        }
        expect(f.events).toEqual([]);
        await expect(f.gateway.invokeProvider!(token, { ...invocation, input: { term: 42 } })).rejects.toMatchObject({
            code: "invalid_input",
        });
        expect(f.events).not.toContain("business");
        f.wrongAudience();
        await expect(f.gateway.invokeProvider!(token, invocation)).rejects.toMatchObject({
            code: "invalid_provider_response",
        });
        expect(f.events).not.toContain("business");
    } finally {
        f.close();
    }
});
