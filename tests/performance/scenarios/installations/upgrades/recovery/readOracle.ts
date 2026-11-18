import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { assertCondition } from "../../../queries/types";

/** Expected identities/revisions are fixture-owned; no successful reader response supplies its own business oracle. */
export function assertRecoveredReader(
    output: unknown,
    capability: string,
    expected: Readonly<{ id: string; kind: "contracts" | "collection"; revision: number; createdAt?: string }>,
    completed: boolean,
) {
    const value =
        capability === "get-site-upgrade-status"
            ? completed
                ? { maintenance: false }
                : {
                      maintenance: true,
                      activeUpgrade: {
                          id: expected.id,
                          kind: expected.kind,
                          status: "prepared",
                          createdAt: expected.createdAt,
                      },
                  }
            : {
                  upgradeId: expected.id,
                  status: completed ? "completed" : "prepared",
                  [capability === "get-contract-upgrade" ? "selectionRevision" : "collectionRevision"]:
                      expected.revision + (completed ? 1 : 0),
              };
    assertCondition(canonicalizeIJson(output) === canonicalizeIJson(value), "recovery-read-same-key-transition");
}
