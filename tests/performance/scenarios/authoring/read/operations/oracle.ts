import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { assertCondition, requireRecord } from "../../../queries/types";
import type { PublishedSource } from "../sources/oracle";

export function publicationStatusOracle(operationId: string, expected: PublishedSource) {
    return (value: unknown) => {
        const output = requireRecord(value);
        assertCondition(
            output.operationId === operationId && output.status === "succeeded",
            "source-operation-terminal-state",
        );
        assertCondition(
            Object.keys(output).toSorted().join(",") === "operationId,result,status" &&
                canonicalizeIJson(output.result) === canonicalizeIJson(expected.publication),
            "source-operation-result-or-projection",
        );
    };
}
