import { describe, expect, test } from "bun:test";
import { computeReleaseDigest, parseContractRelease } from "@bernouy/cms-repository/contracts";
import { satisfiesVersionRange } from "@bernouy/cms-repository/contracts/compatibility";
import { capabilityDocument, contractDocument } from "../support/fixtures";

const payment = { contractId: "money.payment", capabilityId: "payment.checkout.create", versionRange: "^1.1.12" };
const shipment = { contractId: "trade.shipment", capabilityId: "shipment.quote.create", versionRange: "^1.0.0" };
const release = (requires: unknown) =>
    contractDocument({
        contractId: "trade.commerce",
        capabilities: [capabilityDocument({ id: "commerce.checkout.start", requires })],
    });

describe("capability requirements", () => {
    test("retains mandatory provider-neutral references and normalizes their order before hashing", async () => {
        const parsed = parseContractRelease(release([shipment, payment]));
        expect(parsed.capabilities[0]?.requires).toEqual([payment, shipment]);
        expect(Object.isFrozen(parsed.capabilities[0]?.requires)).toBe(true);
        expect(await computeReleaseDigest(release([payment, shipment]))).toBe(
            await computeReleaseDigest(release([shipment, payment])),
        );
        expect(await computeReleaseDigest(release([payment]))).not.toBe(
            await computeReleaseDigest(release([shipment])),
        );
    });

    test("rejects empty, duplicate, malformed, or self requirements", () => {
        expect(() => parseContractRelease(release([]))).toThrow("requires must be nonempty");
        expect(() => parseContractRelease(release([payment, payment]))).toThrow("duplicate required capability");
        expect(() => parseContractRelease(release([{ ...payment, optional: true }]))).toThrow(
            'unknown property "optional"',
        );
        expect(() => parseContractRelease(release([{ ...payment, versionRange: "^1" }]))).toThrow("SemVer range");
        expect(() => parseContractRelease(release([{ ...payment, contractId: "trade.commerce" }]))).toThrow(
            "declaring contract",
        );
    });

    test("supports a bounded union for deliberate adoption of another dependency major", () => {
        const range = "^1.1.12 || ^2.0.0";
        expect(
            parseContractRelease(release([{ ...payment, versionRange: range }])).capabilities[0]?.requires?.[0]
                ?.versionRange,
        ).toBe(range);
        expect(satisfiesVersionRange("1.1.11", range)).toBe(false);
        expect(satisfiesVersionRange("1.1.12", range)).toBe(true);
        expect(satisfiesVersionRange("1.9.0", range)).toBe(true);
        expect(satisfiesVersionRange("2.0.0", range)).toBe(true);
        expect(satisfiesVersionRange("3.0.0", range)).toBe(false);
        expect(satisfiesVersionRange("2.0.0-alpha.1", range)).toBe(false);
        expect(
            parseContractRelease(release([{ ...payment, versionRange: "^2.0.0 || ^1.1.12" }])).capabilities[0]
                ?.requires?.[0]?.versionRange,
        ).toBe(range);
        expect(
            parseContractRelease(release([{ ...payment, versionRange: ">=1.1.12 <2.0.0" }])).capabilities[0]
                ?.requires?.[0]?.versionRange,
        ).toBe("<2.0.0 >=1.1.12");
    });

    test("preserves caret-zero, tilde, comparator, and prerelease boundaries", () => {
        expect(satisfiesVersionRange("0.2.9", "^0.2.3")).toBe(true);
        expect(satisfiesVersionRange("0.3.0", "^0.2.3")).toBe(false);
        expect(satisfiesVersionRange("1.2.9", "~1.2.3")).toBe(true);
        expect(satisfiesVersionRange("1.3.0-beta.1", "~1.2.3")).toBe(false);
        expect(satisfiesVersionRange("2.0.0-alpha.1", ">=1.0.0 <2.0.0")).toBe(false);
        expect(satisfiesVersionRange("1.2.3-alpha.2", ">=1.2.3-alpha.1 <2.0.0")).toBe(true);
    });
});
