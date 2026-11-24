import { expect, test } from "bun:test";
import { DEFAULT_RELEASE_LIMITS, admitContractRelease, parseContractRelease } from "@bernouy/ulvia-contracts";
import { compareContractReleases } from "@bernouy/ulvia-contracts/compatibility";
import { contractDocument } from "../support/fixtures";

const event = {
    id: "payment.succeeded",
    sensitive: false,
    schema: { type: "object", properties: { paymentId: { type: "string", maxLength: 64 } }, required: ["paymentId"] },
};
const document = (overrides: Record<string, unknown> = {}) =>
    contractDocument({ version: "1.0.0", events: [event], ...overrides });

test("event-only contracts retain their schemas in canonical immutable release bytes", async () => {
    const source = document({ capabilities: [] });
    const admission = await admitContractRelease(source);
    expect(admission.release.events).toEqual([event]);
    expect(Object.isFrozen(admission.release.events![0]!.schema)).toBe(true);
    expect(admission.digest).not.toBe(
        (await admitContractRelease(document({ capabilities: [], events: [{ ...event, sensitive: true }] }))).digest,
    );
});

test("event declarations reject unknown keys, missing sensitivity, duplicate IDs and binary leaves", () => {
    for (const events of [
        [{ ...event, sensitive: undefined }],
        [{ ...event, version: "1.0.0" }],
        [{ ...event, id: "payment/invalid" }],
        [event, event],
        [
            {
                ...event,
                schema: {
                    type: "array",
                    maxItems: 1,
                    items: { type: "binary", maxBytes: 10, mediaTypes: ["application/octet-stream"] },
                },
            },
        ],
    ]) {
        expect(() => parseContractRelease(document({ events }))).toThrow();
    }
    expect(() => parseContractRelease(document({ capabilities: [], events: [] }))).toThrow();
    expect(() =>
        parseContractRelease(document({ events: [{ ...event, deprecation: { replacedBy: event.id } }] })),
    ).toThrow();
});

test("event schemas share the complete release node budget with capability schemas", () => {
    const limits = { ...DEFAULT_RELEASE_LIMITS, maxSchemaNodes: 6 };
    expect(() => parseContractRelease(document(), limits)).toThrow("schema nodes");
    expect(() => parseContractRelease(document({ capabilities: [] }), limits)).not.toThrow();
});

test("event output evolution preserves old consumers and treats sensitivity as a compatibility change", () => {
    const before = parseContractRelease(document());
    const compare = (events: unknown[]) =>
        compareContractReleases(before, parseContractRelease(document({ version: "1.1.0", events })));
    expect(compare([{ ...event, description: "Confirmed after durable payment settlement." }]).requiredBump).toBe(
        "patch",
    );
    expect(compare([event, { ...event, id: "payment.failed" }]).requiredBump).toBe("minor");
    expect(compare([{ ...event, sensitive: true }])).toMatchObject({ requiredBump: "major", validEvolution: false });
    expect(compare([{ ...event, schema: { ...event.schema, properties: {}, required: [] } }]).consumerCompatible).toBe(
        false,
    );
    expect(
        compare([
            {
                ...event,
                schema: {
                    ...event.schema,
                    properties: { ...event.schema.properties, note: { type: "string", maxLength: 32 } },
                },
            },
        ]).requiredBump,
    ).toBe("minor");
});

test("event routing keys are explicit, required, nonsensitive and bounded before a source is admitted", () => {
    expect(
        parseContractRelease(document({ events: [{ ...event, filterKeys: ["paymentId"] }] })).events![0]!.filterKeys,
    ).toEqual(["paymentId"]);
    for (const keys of [
        [],
        ["missing"],
        ["paymentId", "paymentId"],
        Array.from({ length: 9 }, (_, index) => `field${index}`),
    ]) {
        expect(() => parseContractRelease(document({ events: [{ ...event, filterKeys: keys }] }))).toThrow();
    }
    for (const field of [
        { type: "string", maxLength: 257 },
        { type: "string", maxLength: 64, sensitive: true },
        { type: "string", maxLength: 64, nullable: true },
        { type: "object", properties: {}, required: [] },
    ]) {
        expect(() =>
            parseContractRelease(
                document({
                    events: [
                        {
                            ...event,
                            filterKeys: ["paymentId"],
                            schema: { ...event.schema, properties: { paymentId: field } },
                        },
                    ],
                }),
            ),
        ).toThrow();
    }
});
