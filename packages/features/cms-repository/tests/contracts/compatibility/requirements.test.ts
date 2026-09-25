import { describe, expect, test } from "bun:test";
import { parseContractRelease } from "@bernouy/cms-repository/contracts";
import { compareContractReleases } from "@bernouy/cms-repository/contracts/compatibility";
import { capabilityDocument, contractDocument } from "../support/fixtures";

const requirement = { contractId: "money.payment", capabilityId: "payment.checkout.create", versionRange: "^1.1.12" };
const release = (version: string, requires?: readonly unknown[]) =>
    parseContractRelease(
        contractDocument({
            version,
            contractId: "trade.commerce",
            capabilities: [
                capabilityDocument({ id: "commerce.checkout.start", ...(requires === undefined ? {} : { requires }) }),
            ],
        }),
    );

describe("requirement compatibility", () => {
    test("adding a mandatory external capability to an existing capability requires a major", () => {
        expect(compareContractReleases(release("1.0.0"), release("1.1.0", [requirement]))).toMatchObject({
            requiredBump: "major",
        });
    });

    test("adding a capability with its own requirement remains a minor addition", () => {
        const previous = release("1.0.0");
        const addition = capabilityDocument({ id: "commerce.payment.start", requires: [requirement] });
        addition.binding = { ...(addition.binding as Record<string, unknown>), path: "/v1/payments" };
        const next = parseContractRelease(
            contractDocument({
                version: "1.1.0",
                contractId: "trade.commerce",
                capabilities: [...previous.capabilities, addition],
            }),
        );
        expect(compareContractReleases(previous, next).requiredBump).toBe("minor");
    });

    test("adding another major without dropping the old one is minor; replacing it is major", () => {
        const previous = release("1.0.0", [requirement]);
        const expanded = release("1.1.0", [{ ...requirement, versionRange: "^1.1.12 || ^2.0.0" }]);
        const replaced = release("1.1.0", [{ ...requirement, versionRange: "^2.0.0" }]);
        expect(compareContractReleases(previous, expanded).requiredBump).toBe("minor");
        expect(compareContractReleases(previous, replaced).requiredBump).toBe("major");
    });

    test("equivalent syntax remains patch and a wider lower bound is minor", () => {
        const previous = release("1.0.0", [requirement]);
        const equivalent = release("1.0.1", [{ ...requirement, versionRange: ">=1.1.12 <2.0.0" }]);
        const expanded = release("1.1.0", [{ ...requirement, versionRange: "^1.0.0" }]);
        expect(compareContractReleases(previous, equivalent).requiredBump).toBe("patch");
        expect(compareContractReleases(previous, equivalent).issues).toEqual([]);
        expect(compareContractReleases(previous, expanded).requiredBump).toBe("minor");
    });

    test("introducing a gap into accepted dependency versions requires a major", () => {
        const previous = release("1.0.0", [{ ...requirement, versionRange: "^1.0.0 || ^2.0.0" }]);
        const next = release("1.1.0", [{ ...requirement, versionRange: ">=1.0.0 <1.5.0 || >=1.5.1 <3.0.0" }]);
        expect(compareContractReleases(previous, next).requiredBump).toBe("major");
    });

    test("losing opted-in prereleases is major even when stable versions are preserved", () => {
        const previous = release("1.0.0", [{ ...requirement, versionRange: "^1.1.12-alpha.1" }]);
        const next = release("1.1.0", [{ ...requirement, versionRange: "^1.0.0" }]);
        expect(compareContractReleases(previous, next).requiredBump).toBe("major");
    });

    test("support/test partition changes do not alter accepted-version compatibility", () => {
        const range = { ...requirement, versionRange: "^1.0.0 || ^2.0.0" };
        const previous = release("1.0.0", [range]);
        const explicit = release("1.0.1", [{ ...range, supportRanges: ["^1.0.0", "^2.0.0"] }]);
        const recombined = release("1.0.2", [{ ...range, supportRanges: [">=1.0.0 <3.0.0"] }]);
        expect(compareContractReleases(previous, explicit)).toMatchObject({
            validEvolution: true,
            consumerCompatible: true,
            requiredBump: "patch",
            issues: [],
        });
        expect(compareContractReleases(explicit, recombined).requiredBump).toBe("patch");
    });
});
