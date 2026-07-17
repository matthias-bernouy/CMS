import { describe, expect, test } from "bun:test";
import {
    executeRelay,
    expectGenericFailure,
    relayRequest,
} from "../harness";
import {
    selectorResponder,
    successfulResponder,
} from "../responders";
import { paths } from "./calls";

describe("setRelayPointForOrder contract", () => {
    test("validates the exact input shape before any source call", async () => {
        const missing = await executeRelay(
            "setRelayPointForOrder",
            successfulResponder(),
            {
                request: new Request(
                    "https://cms.test/functions/setRelayPointForOrder",
                    {
                        method: "POST",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify({
                            relayLocation: "FR-024474",
                            country: "FR",
                            postalCode: "75001",
                        }),
                    },
                ),
            },
        );
        const extra = await executeRelay(
            "setRelayPointForOrder",
            successfulResponder(),
            {
                request: new Request(relayRequest(
                    "setRelayPointForOrder",
                ).url, {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({
                        orderId: "42",
                        relayLocation: "FR-024474",
                        country: "FR",
                        postalCode: "75001",
                        actorId: "spoofed",
                    }),
                }),
            },
        );

        expect([
            missing.response.status,
            await missing.response.json(),
            missing.calls,
        ]).toEqual([400, { error: "body.orderId is required" }, []]);
        expect([
            extra.response.status,
            await extra.response.json(),
            extra.calls,
        ]).toEqual([400, { error: "body.actorId is not allowed" }, []]);
    });
});

describe("setRelayPointForOrder boundaries", () => {
    test("keeps numeric-looking order selectors at the Commerce boundary", async () => {
        for (const orderId of [
            "",
            "invalid",
            "7.5",
            "-1",
            "9007199254740992",
        ]) {
            const request = new Request(
                "https://cms.test/functions/setRelayPointForOrder",
                {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({
                        orderId,
                        relayLocation: "FR-024474",
                        country: "FR",
                        postalCode: "75001",
                    }),
                },
            );
            const result = await executeRelay(
                "setRelayPointForOrder",
                selectorResponder,
                { request },
            );

            await expectGenericFailure(result.response);
            expect(paths(result.calls)).toEqual([
                "/delivery-setup-context",
            ]);
            expect(result.calls[0]?.url.searchParams.get("orderId")).toBe(
                orderId || null,
            );
        }
    });

    test("rejects a non-string selector before Commerce", async () => {
        const request = new Request(
            "https://cms.test/functions/setRelayPointForOrder",
            {
                method: "POST",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({
                    orderId: 42,
                    relayLocation: "FR-024474",
                    country: "FR",
                    postalCode: "75001",
                }),
            },
        );
        const result = await executeRelay(
            "setRelayPointForOrder",
            successfulResponder(),
            { request },
        );

        expect(result.response.status).toBe(400);
        expect(await result.response.json()).toEqual({
            error: "body.orderId must be a string",
        });
        expect(result.calls).toEqual([]);
    });
});
