import { describe, expect, test } from "bun:test";
import {
    connectStatus,
    offerResult,
    sellerTermsHash,
    sellerTermsVersion,
} from "../fixtures";
import { executeSellerPrice, expectGenericFailure } from "../harness";
import { privateFailure, sellerPriceResponder } from "../responders";

describe("Commerce Stripe seller price concurrent orchestration", () => {
    test("preserves CAS commands and one downstream conflict for overlap", async () => {
        let arrivals = 0;
        let resultCalls = 0;
        let release!: () => void;
        const barrier = new Promise<void>(resolve => { release = resolve; });
        const responder = sellerPriceResponder({
            enrollment: async () => {
                arrivals += 1;
                if (arrivals === 2) release();
                await barrier;
                return connectStatus({
                    enrolled: true,
                    currentTermsAccepted: true,
                });
            },
            result: () => {
                resultCalls += 1;
                return resultCalls === 1
                    ? offerResult
                    : privateFailure(409, "stale offer version");
            },
        });
        const results = await Promise.all([
            executeSellerPrice(responder),
            executeSellerPrice(responder),
        ]);

        expect(results.map(result => result.response.status).sort())
            .toEqual([200, 502]);
        const succeeded = results.find(result => result.response.status === 200)!;
        const failed = results.find(result => result.response.status === 502)!;
        expect(await succeeded.response.json()).toEqual(offerResult);
        const failure = await failed.response.json();
        expect(failure).toEqual({
            error: "Function execution failed",
            correlationId: expect.any(String),
        });
        expect(JSON.stringify(failure)).not.toContain("stale offer version");
        for (const result of results) {
            expect(result.calls.map(call => call.url.pathname)).toEqual([
                "/seller", "/status", "/enrollment", "/offer/price",
            ]);
        }
        expect(results[0]?.calls[2]?.body).toEqual(
            results[1]?.calls[2]?.body,
        );
        expect(results[0]?.calls[2]?.body).toEqual({
            accountToken: "accttok_first",
            marketplaceTermsAccepted: true,
            marketplaceTermsVersion: sellerTermsVersion,
            marketplaceTermsHash: sellerTermsHash,
        });
        expect(results[0]?.calls[3]?.body).toEqual(
            results[1]?.calls[3]?.body,
        );
        expect(results[0]?.calls[3]?.body).toEqual({
            amount: 12_000,
            expectedVersion: 3,
        });
    });

    test("retries orchestration but not the mutation after a lost response", async () => {
        let enrolled = false;
        let resultAttempts = 0;
        let mutations = 0;
        const responder = sellerPriceResponder({
            status: () => connectStatus({
                enrolled,
                currentTermsAccepted: enrolled,
            }),
            enrollment: () => {
                enrolled = true;
                return connectStatus({
                    enrolled: true,
                    currentTermsAccepted: true,
                });
            },
            result: () => {
                resultAttempts += 1;
                if (resultAttempts === 1) {
                    mutations += 1;
                    throw new Error("response lost after Commerce committed");
                }
                return privateFailure(409, "stale offer version");
            },
        });

        const first = await executeSellerPrice(responder);
        const retry = await executeSellerPrice(responder, {
            identities: first.identities,
        });

        await expectGenericFailure(first.response);
        await expectGenericFailure(retry.response);
        for (const execution of [first, retry]) {
            expect(execution.calls.map(call => call.url.pathname)).toEqual([
                "/seller", "/status", "/enrollment", "/offer/price",
            ]);
        }
        expect(first.calls[3]?.body).toEqual({
            amount: 12_000,
            expectedVersion: 3,
        });
        expect(retry.calls[3]?.body).toEqual(first.calls[3]?.body);
        expect(resultAttempts).toBe(2);
        expect(mutations).toBe(1);
    });
});
