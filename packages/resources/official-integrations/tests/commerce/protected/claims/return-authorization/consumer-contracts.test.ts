import { describe, expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

type JsonRecord = Record<string, unknown>;
type FunctionDefinition = JsonRecord & { id: string; steps: JsonRecord[] };

const commerceSource = "{{dependencies.commerce.sourceId}}";
const deliverySource = "{{dependencies.delivery.sourceId}}";
const definitionPath = resolve(
    import.meta.dir,
    "../../../../../integrations/commerce-mondial-relay-fulfillment/versions/1.0.0/definition.json",
);

describe("claim return authorization consumer contracts", () => {
    test("keeps exact Commerce selectors and downstream call boundaries", async () => {
        const functions = await returnFunctions();
        const actual = Object.fromEntries(functions.map(fn => [
            fn.id,
            allCalls(fn).map(callContract),
        ]));

        expect(actual).toEqual({
            getClaimReturnForMe: [
                call(commerceSource, "getClaimReturnAuthorization", "$input.params.claimId"),
                call(deliverySource, "shipmentForExternalOrder"),
            ],
            setRelayPointForMyClaimReturn: [
                call(commerceSource, "getClaimReturnAuthorization", "$input.body.claimId"),
                call(deliverySource, "saveClaimReturnRelaySelection"),
            ],
            getRelayPointForMyClaimReturn: [
                call(commerceSource, "getClaimReturnAuthorization", "$input.params.claimId"),
                call(deliverySource, "relaySelection"),
            ],
            createClaimReturnShipmentForMyPurchase: [
                call(commerceSource, "getClaimReturnAuthorization", "$input.body.claimId"),
                call(deliverySource, "resolveDeliveryQuote"),
                call(deliverySource, "relaySelection"),
                call(commerceSource, "getClaimReturnAuthorization", "$steps.authorization.claimId"),
                call(deliverySource, "createShipment"),
            ],
            requestClaimReturnLabelForMyPurchase: [
                call(commerceSource, "getClaimReturnAuthorization", "$input.body.claimId"),
                call(deliverySource, "issueLabelAccess"),
            ],
        });
    });

    test("keeps each consumer limited to its current authorization fields", async () => {
        const actual = Object.fromEntries((await returnFunctions()).map(fn => [
            fn.id,
            authorizationFields(fn),
        ]));

        expect(actual).toEqual({
            getClaimReturnForMe: [
                "allowed", "buyerCmsUserId", "claimId", "claimStatus", "orderNumber",
                "reason", "returnDeliveryStatus", "returnShipByAt", "sellerCmsUserId",
            ],
            setRelayPointForMyClaimReturn: [
                "allowed", "claimId", "sellerCmsUserId",
            ],
            getRelayPointForMyClaimReturn: [
                "buyerCmsUserId", "claimId", "sellerCmsUserId",
            ],
            createClaimReturnShipmentForMyPurchase: [
                "allowed", "buyerCmsUserId", "claimId", "claimVersion", "currency",
                "deliveryQuoteId", "merchandiseSubtotalMinorAmount", "orderPublicId",
                "sellerCmsUserId",
            ],
            requestClaimReturnLabelForMyPurchase: [
                "allowed", "buyerCmsUserId", "claimId",
            ],
        });
    });

    test("keeps the TOCTOU recheck after preparation and before shipment creation", async () => {
        const fn = (await returnFunctions()).find(candidate => (
            candidate.id === "createClaimReturnShipmentForMyPurchase"
        ))!;
        const identifiedSteps = fn.steps
            .filter(step => typeof step.id === "string")
            .map(step => ({ id: step.id, endpoint: callEndpoint(step) }));

        expect(identifiedSteps).toEqual([
            { id: "authorization", endpoint: "getClaimReturnAuthorization" },
            { id: "quote", endpoint: "resolveDeliveryQuote" },
            { id: "selection", endpoint: "relaySelection" },
            { id: "authorizationRecheck", endpoint: "getClaimReturnAuthorization" },
            { id: "shipment", endpoint: "createShipment" },
        ]);

        const recheckIndex = fn.steps.findIndex(step => step.id === "authorizationRecheck");
        expect(fn.steps[recheckIndex + 1]).toEqual({
            assert: {
                condition: {
                    all: [
                        { equals: ["$steps.authorizationRecheck.allowed", true] },
                        { equals: ["$steps.authorizationRecheck.claimVersion", "$steps.authorization.claimVersion"] },
                        { equals: ["$steps.authorizationRecheck.buyerCmsUserId", "$steps.authorization.buyerCmsUserId"] },
                        { equals: ["$steps.authorizationRecheck.sellerCmsUserId", "$steps.authorization.sellerCmsUserId"] },
                        { equals: ["$steps.authorizationRecheck.orderPublicId", "$steps.authorization.orderPublicId"] },
                    ],
                },
                failure: {
                    status: 409,
                    error: "Claim return authorization changed before shipment creation",
                },
            },
        });
    });
});

async function returnFunctions(): Promise<FunctionDefinition[]> {
    const definition = JSON.parse(await readFile(definitionPath, "utf8"));
    const expected = new Set([
        "getClaimReturnForMe", "setRelayPointForMyClaimReturn",
        "getRelayPointForMyClaimReturn", "createClaimReturnShipmentForMyPurchase",
        "requestClaimReturnLabelForMyPurchase",
    ]);
    return definition.artifacts
        .map((artifact: JsonRecord) => artifact.function)
        .filter((value: unknown): value is FunctionDefinition => (
            isRecord(value) && expected.has(String(value.id)) && Array.isArray(value.steps)
        ));
}

function allCalls(value: unknown): JsonRecord[] {
    if (Array.isArray(value)) return value.flatMap(allCalls);
    if (!isRecord(value)) return [];
    const own = isRecord(value.call) ? [value.call] : [];
    return [...own, ...Object.values(value).flatMap(allCalls)];
}

function callContract(value: JsonRecord): JsonRecord {
    const claimId = isRecord(value.params) ? value.params.claimId : undefined;
    return {
        source: value.source,
        endpoint: value.endpoint,
        ...(claimId === undefined ? {} : { claimId }),
    };
}

function call(source: string, endpoint: string, claimId?: string): JsonRecord {
    return { source, endpoint, ...(claimId === undefined ? {} : { claimId }) };
}

function authorizationFields(value: unknown): string[] {
    const prefixes = [
        "$steps.authorization.",
        "$steps.authorizationRecheck.",
    ];
    const fields = stringValues(value).flatMap(entry => {
        const prefix = prefixes.find(candidate => entry.startsWith(candidate));
        return prefix ? [entry.slice(prefix.length)] : [];
    });
    return [...new Set(fields)].sort();
}

function stringValues(value: unknown): string[] {
    if (typeof value === "string") return [value];
    if (Array.isArray(value)) return value.flatMap(stringValues);
    if (!isRecord(value)) return [];
    return Object.values(value).flatMap(stringValues);
}

function callEndpoint(value: JsonRecord): unknown {
    return isRecord(value.call) ? value.call.endpoint : undefined;
}

function isRecord(value: unknown): value is JsonRecord {
    return value !== null && typeof value === "object" && !Array.isArray(value);
}
