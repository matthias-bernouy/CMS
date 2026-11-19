import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { assertCondition, requireRecord } from "../../queries/types";

/** An invalidated reader must expose exactly the expected changed public projection. */
export function installationReadOracle(expected: Readonly<Record<string, unknown>>) {
    const canonical = canonicalizeIJson(expected);
    return (output: unknown) => {
        if (canonicalizeIJson(output) === canonical) {
            return;
        }
        const actual = requireRecord(output);
        const changed = Object.keys(expected).filter(
            (key) => !(key in actual) || canonicalizeIJson(actual[key]) !== canonicalizeIJson(expected[key]),
        );
        if (Object.keys(actual).some((key) => !(key in expected))) {
            changed.push("unexpected-fields");
        }
        assertCondition(false, `installation-reader-projection-${changed.toSorted().join("-")}`);
    };
}

/** A disabled source retains pairing, but none of its requested capabilities remain authorized. */
export function providerReadAfterDisable(before: Readonly<Record<string, unknown>>, capability: string) {
    const revision = Number(before.revision) + 1;
    if (capability === "get-provider-installation") {
        const { observedAt: _observedAt, ...approval } = before;
        return { ...approval, revision, status: "disabled", contracts: [] };
    }
    assertCondition(
        capability === "get-provider-access" && Array.isArray(before.requests),
        "installation-provider-access-requests",
    );
    return {
        ...before,
        revision,
        requests: before.requests.map((row) => ({ ...requireRecord(row), selected: false })),
    };
}

/** Access inspection classifies an unknown installation as INVALID_INPUT; the installation reader declares NOT_FOUND. */
export function providerReadMissingStatus(capability: string) {
    assertCondition(
        ["get-provider-access", "get-provider-installation"].includes(capability),
        "installation-provider-reader-kind",
    );
    return capability === "get-provider-access" ? 422 : 404;
}
