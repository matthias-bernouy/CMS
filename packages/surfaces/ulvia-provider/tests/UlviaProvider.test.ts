import { describe, expect, test } from "bun:test";
import { DefaultProviderCapabilityDispatcher } from "@bernouy/ulvia-provider";
import { BunRunner } from "@bernouy/http-runner";
import { serveForTest } from "@bernouy/http-runner/testing";
import { createMemoryLogger } from "@bernouy/logging/testing";
import { MAX_CAPABILITY_JSON_BYTES } from "@bernouy/cms-repository/contracts/protocol";
import { UlviaProvider } from "../src";
import {
    contractRelease,
    forgedAuthorityHeaders,
    invocationHeaders,
    providerOptions,
    PROVIDER_INSTANCE_ID,
    reportAuthorization,
    requestUuidFor,
} from "./ulviaProviderFixture";

describe("UlviaProvider", () => {
    test("authenticates the report and dispatches declared HTTP bindings", async () => {
        const contract = await contractRelease();
        const dispatcher = new DefaultProviderCapabilityDispatcher();
        const subjects: Array<string | undefined> = [];
        dispatcher.register("ulvia.cms.fixture", "echo", async (input, context) => {
            subjects.push(context.subjectId);
            return { id: input.id, value: input.value };
        });
        const runner = new BunRunner();
        new UlviaProvider(runner, providerOptions([contract], dispatcher));
        const server = serveForTest(runner);
        try {
            expect((await server.request("GET", "/ulvia/report")).status).toBe(401);
            const report = await server.request("GET", "/ulvia/report", { headers: reportAuthorization() });
            expect(report.status).toBe(200);
            expect((await report.json()).providerId).toBe("ulvia.official");

            const response = await server.request("POST", "/v1/provider/echo/record-1", {
                headers: { ...invocationHeaders("request-1", "subject-a"), "Content-Type": "application/json" },
                body: JSON.stringify({ value: "hello" }),
            });
            expect(response.status).toBe(200);
            expect(await response.json()).toEqual({ id: "record-1", value: "hello" });

            const anonymousResponse = await server.request("POST", "/v1/provider/echo/record-2", {
                headers: {
                    ...invocationHeaders("request-2"),
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ value: "from-provider" }),
            });
            expect(anonymousResponse.status).toBe(200);
            expect(subjects).toEqual(["subject-a", undefined]);

            const forged = await server.request("POST", "/v1/provider/echo/record-3", {
                headers: {
                    ...reportAuthorization(),
                    ...forgedAuthorityHeaders("request-3"),
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ value: "forged" }),
            });
            expect(forged.status).toBe(401);

            const mismatchedRequest = await server.request("POST", "/v1/provider/echo/record-4", {
                headers: {
                    ...invocationHeaders("signed-request"),
                    "x-ulvia-request-id": requestUuidFor("different-request"),
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ value: "mismatch" }),
            });
            expect(mismatchedRequest.status).toBe(400);

            const wrongCapability = await server.request("POST", "/v1/provider/echo/record-5", {
                headers: {
                    ...invocationHeaders("wrong-capability", undefined, "other"),
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ value: "mismatch" }),
            });
            expect(wrongCapability.status).toBe(404);

            const oversized = await server.request("POST", "/v1/provider/echo/record-1", {
                headers: { ...invocationHeaders("request-4"), "Content-Type": "application/json" },
                body: JSON.stringify({ value: "x".repeat(MAX_CAPABILITY_JSON_BYTES + 1) }),
            });
            expect(oversized.status).toBe(413);
        } finally {
            server.stop();
        }
    });

    test("does not expose undeclared routes", async () => {
        const contract = await contractRelease();
        const dispatcher = new DefaultProviderCapabilityDispatcher();
        dispatcher.register("ulvia.cms.fixture", "echo", async (input) => input);
        const runner = new BunRunner();
        new UlviaProvider(runner, providerOptions([contract], dispatcher));
        const server = serveForTest(runner);
        try {
            expect(
                (
                    await server.request("POST", "/v1/provider/missing", {
                        headers: invocationHeaders("request-missing"),
                    })
                ).status,
            ).toBe(404);
        } finally {
            server.stop();
        }
    });

    test("logs an unexpected capability failure without recording its input", async () => {
        const contract = await contractRelease();
        const dispatcher = new DefaultProviderCapabilityDispatcher();
        dispatcher.register("ulvia.cms.fixture", "echo", async () => {
            throw new Error("storage unavailable");
        });
        const memory = createMemoryLogger({ service: "provider-test", level: "debug" });
        const runner = new BunRunner();
        new UlviaProvider(runner, providerOptions([contract], dispatcher, PROVIDER_INSTANCE_ID, memory.logger));
        const server = serveForTest(runner);
        try {
            const response = await server.request("POST", "/v1/provider/echo/record-1", {
                headers: { ...invocationHeaders("failed-capability"), "Content-Type": "application/json" },
                body: JSON.stringify({ value: "must-not-be-logged" }),
            });

            expect(response.status).toBe(503);
            expect(memory.records).toEqual([
                expect.objectContaining({
                    level: "error",
                    event: "provider.capability.failed",
                    attributes: {
                        contractId: "ulvia.cms.fixture",
                        capabilityId: "echo",
                        status: 503,
                    },
                    error: expect.objectContaining({ name: "Error", message: "storage unavailable" }),
                }),
            ]);
            expect(JSON.stringify(memory.records)).not.toContain("must-not-be-logged");
        } finally {
            server.stop();
        }
    });

    test("rejects a signed invocation minted for another provider instance", async () => {
        const contract = await contractRelease();
        const dispatcher = new DefaultProviderCapabilityDispatcher();
        dispatcher.register("ulvia.cms.fixture", "echo", async (input) => input);
        const runner = new BunRunner();
        new UlviaProvider(runner, providerOptions([contract], dispatcher, "instance:fixture-b"));
        const server = serveForTest(runner);
        try {
            const response = await server.request("POST", "/v1/provider/echo/record-1", {
                headers: {
                    ...invocationHeaders("instance-a", undefined, "echo", PROVIDER_INSTANCE_ID),
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ value: "cross-instance" }),
            });
            expect(response.status).toBe(401);
        } finally {
            server.stop();
        }
    });

    test("dispatches the exact signed contract release when versions share one route", async () => {
        const first = await contractRelease("1.0.0");
        const second = await contractRelease("2.0.0");
        const versions: string[] = [];
        const dispatcher = new DefaultProviderCapabilityDispatcher();
        dispatcher.register("ulvia.cms.fixture", "echo", async (input, context) => {
            versions.push(context.contractVersion);
            return input;
        });
        const runner = new BunRunner();
        new UlviaProvider(runner, providerOptions([first, second], dispatcher));
        const server = serveForTest(runner);
        try {
            const response = await server.request("POST", "/v1/provider/echo/record-2", {
                headers: {
                    ...invocationHeaders("version-2", undefined, "echo", PROVIDER_INSTANCE_ID, "2.0.0"),
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ value: "second" }),
            });
            expect(response.status).toBe(200);
            expect(versions).toEqual(["2.0.0"]);

            const missing = await server.request("POST", "/v1/provider/echo/record-3", {
                headers: {
                    ...invocationHeaders("version-3", undefined, "echo", PROVIDER_INSTANCE_ID, "3.0.0"),
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({ value: "missing" }),
            });
            expect(missing.status).toBe(404);
        } finally {
            server.stop();
        }
    });
});

test("revoked site grants block invocation tokens issued before revocation", async () => {
    const contract = await contractRelease();
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    let allowed = true;
    let calls = 0;
    dispatcher.register("ulvia.cms.fixture", "echo", async (input) => {
        calls++;
        return { id: input.id, value: input.value };
    });
    const runner = new BunRunner();
    new UlviaProvider(
        runner,
        providerOptions([contract], dispatcher, undefined, undefined, async () => allowed),
    );
    const server = serveForTest(runner);
    const headers = { ...invocationHeaders("issued-before-revocation"), "Content-Type": "application/json" };
    const request = () =>
        server.request("POST", "/v1/provider/echo/record-1", { headers, body: JSON.stringify({ value: "hello" }) });
    try {
        expect((await request()).status).toBe(200);
        allowed = false;
        expect((await request()).status).toBe(403);
        expect(calls).toBe(1);
    } finally {
        await server.stop();
    }
});
