import { describe, expect, test } from "bun:test";
import { claims, commerceBody, shipment, tracking, type EventKind } from "./fixtures";
import { executeClaimReturnEvent, successfulResponder } from "./harness";

describe("Commerce Mondial Relay claim return event contracts", () => {
    for (const kind of ["carrier", "handoff"] satisfies EventKind[]) {
        test(`returns the exact ${kind} shipment, tracking, and claim DTOs`, async () => {
            const { response, calls } = await executeClaimReturnEvent(kind, successfulResponder(kind));

            expect(response.status).toBe(200);
            expect(await response.json()).toEqual({ shipment, tracking, claim: claims[kind] });
            expect(calls.at(-1)?.body).toEqual(commerceBody(kind));
        });
    }

    test("preserves nullable shipment fields and provider event order", async () => {
        const { response } = await executeClaimReturnEvent("handoff", successfulResponder("handoff"));

        const body = await response.json();
        expect(body.shipment.lastError).toBeNull();
        expect(body.shipment.trackingUrl).toBeNull();
        expect(body.shipment.sellerHandoffDeclaredAt).toBeNull();
        expect(body.shipment.events).toEqual(shipment.events);
        expect(body.tracking.events).toEqual(tracking.events);
        expect(Object.keys(body)).toEqual(["shipment", "tracking", "claim"]);
    });

    test("uses the same deterministic event key for concurrent replays", async () => {
        const bodies: unknown[] = [];
        const responder = successfulResponder("carrier");
        const capturingResponder = async (request: Request) => {
            if (new URL(request.url).pathname === "/recordClaimReturnDelivery") {
                bodies.push(await request.clone().json());
            }
            return await responder(request);
        };

        const results = await Promise.all([
            executeClaimReturnEvent("carrier", capturingResponder),
            executeClaimReturnEvent("carrier", capturingResponder),
        ]);

        expect(results.map(({ response }) => response.status)).toEqual([200, 200]);
        expect(bodies).toHaveLength(2);
        expect(bodies[0]).toEqual(commerceBody("carrier"));
        expect(bodies[1]).toEqual(commerceBody("carrier"));
    });
});
