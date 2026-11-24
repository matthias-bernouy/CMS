import { expect, test } from "bun:test";
import { eventsFor, defineEvent, defineFeature, contractString, z } from "@bernouy/ulvia-sdk";
import { compileContract } from "@bernouy/ulvia-sdk/build";

const paymentSucceeded = defineEvent({
    id: "payment.succeeded",
    sensitive: false,
    schema: z.strictObject({
        paymentId: contractString({ maxLength: 64 }),
        privateNote: contractString({ maxLength: 128 }).optional(),
    }),
});
const feature = defineFeature({
    contractId: "example/payments",
    publisherId: "example",
    name: "Payments",
    version: "1.0.0",
    capabilities: [],
    events: [paymentSucceeded],
});

test("one SDK event declaration generates the contract schema without separate registration", async () => {
    const { release } = await compileContract(feature);
    expect(release.events![0]).toMatchObject({
        id: "payment.succeeded",
        sensitive: false,
        schema: {
            type: "object",
            required: ["paymentId"],
            properties: { paymentId: { type: "string", maxLength: 64 } },
        },
    });
    expect(Object.isFrozen(feature.events)).toBe(true);
});

test("event authoring cannot bypass Ulvia representability or redeclare an inherited event", async () => {
    await expect(
        compileContract(
            defineFeature({
                ...feature,
                events: [defineEvent({ ...paymentSucceeded, schema: z.string().transform((value) => value.length) })],
            }),
        ),
    ).rejects.toThrow();
    const child = defineFeature({ ...feature, contractId: "example/payments.special", extends: feature });
    await expect(compileContract(child)).rejects.toThrow("inherited event");
});

test("inherited facts retain their declaring contract identity and stable producer key", async () => {
    const publications: { key: string; contractId: string }[] = [];
    const publisher = {
        enqueue: async (key: string, value: { contractId: string }) => {
            publications.push({ key, contractId: value.contractId });
        },
    };
    const child = defineFeature({
        ...feature,
        contractId: "example/payments.special",
        extends: feature,
        events: [defineEvent({ id: "payment.reviewed", schema: z.boolean(), sensitive: false })],
    });
    await eventsFor(feature, publisher).emit("payment.succeeded", "payment-1", { paymentId: "one" });
    await eventsFor(child, publisher).emit("payment.succeeded", "payment-1", { paymentId: "one" });
    await eventsFor(child, publisher).emit("payment.reviewed", "payment-1", true);
    expect(publications[0]).toEqual(publications[1]);
    expect(publications[2]!.contractId).toBe("example/payments.special");
    expect(publications[2]!.key).not.toBe(publications[0]!.key);
});

test("typed emission captures provenance before durable enqueue and refuses ambiguous or unhosted origins", async () => {
    const values: unknown[] = [];
    const emitter = eventsFor(feature, {
        capture: async (input) => {
            values.push(input);
            return "verified-reference";
        },
        enqueue: async (_key, value) => {
            values.push(value);
        },
    });
    const initiatorProof = await emitter.capture("payment.succeeded", "payment-1");
    await emitter.emit("payment.succeeded", "payment-1", { paymentId: "one" }, { initiatorProof });
    expect(values).toEqual([
        { contractId: "example/payments", eventType: "payment.succeeded", occurrenceId: "payment-1" },
        {
            contractId: "example/payments",
            eventType: "payment.succeeded",
            occurrenceId: "payment-1",
            payloadJson: '{"paymentId":"one"}',
            initiatorProof: "verified-reference",
        },
    ]);
    await expect(
        emitter.emit("payment.succeeded", "other", { paymentId: "one" }, { initiatorProof, causeDeliveryId: "parent" }),
    ).rejects.toThrow("Invalid initiator proof");
    await expect(eventsFor(feature, { enqueue: async () => {} }).capture("payment.succeeded", "one")).rejects.toThrow(
        "host",
    );
    expect(values).toHaveLength(2);
});
