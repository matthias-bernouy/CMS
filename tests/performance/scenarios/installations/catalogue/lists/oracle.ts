import { assertProviderRoutes } from "./routes";
import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { assertCondition, requireRecord } from "../../../queries/types";
import type { MetadataContext } from "../state/context";

export type MetadataListExpectation = Pick<MetadataContext, "repositoryId"> &
    Readonly<{
        resources: Pick<MetadataContext["resources"], "providers">;
        connections: Pick<MetadataContext["connections"], "baseline" | "rows" | "selections" | "revision">;
    }>;

export function availableProviderOracle(state: MetadataListExpectation) {
    const expected = new Map(
        state.resources.providers.map((row) => [
            `${row.id}@${row.version}`,
            {
                repositoryId: state.repositoryId,
                publisherId: row.namespace,
                id: row.id,
                version: row.version,
                digest: row.digest,
                name: row.name,
            },
        ]),
    );
    return (output: unknown) => {
        const row = requireRecord(output);
        assertCondition(
            Array.isArray(row.items) && row.items.length === expected.size,
            "metadata-provider-catalogue-complete",
        );
        const seen = new Set<string>();
        for (const raw of row.items) {
            const value = requireRecord(raw);
            const key = `${value.id}@${value.version}`;
            assertCondition(
                !seen.has(key) && canonicalizeIJson(value) === canonicalizeIJson(expected.get(key)),
                "metadata-provider-catalogue-exact-known-row",
            );
            seen.add(key);
        }
    };
}

export function installedProviderOracle(state: MetadataListExpectation) {
    return (output: unknown) => {
        const row = requireRecord(output);
        assertCondition(
            row.selectionRevision === state.connections.revision &&
                canonicalizeIJson(row.selections) === canonicalizeIJson(state.connections.selections),
            "metadata-provider-exact-selections",
        );
        const baseline = new Map(state.connections.baseline.map((entry) => [String(entry.id), entry]));
        const controlled = new Map([...state.connections.rows.values()].map((entry) => [entry.id, entry]));
        assertCondition(
            Array.isArray(row.installations) && row.installations.length === baseline.size + controlled.size,
            "metadata-provider-complete-installation-count",
        );
        const seen = new Set<string>();
        for (const raw of row.installations) {
            const entry = requireRecord(raw);
            const id = String(entry.id);
            assertCondition(
                !seen.has(id) &&
                    Object.keys(entry).every((key) =>
                        [
                            "id",
                            "providerId",
                            "accountId",
                            "endpoint",
                            "status",
                            "manifestVersion",
                            "revision",
                            "observedAt",
                            "selectionCount",
                        ].includes(key),
                    ),
                "metadata-provider-private-or-duplicate-row",
            );
            const found = controlled.get(id) ?? baseline.get(id);
            assertCondition(found, "metadata-provider-known-approved-identity");
            const expected = requireRecord(found);
            for (const field of ["id", "providerId", "accountId", "status", "manifestVersion"]) {
                assertCondition(entry[field] === expected[field], "metadata-provider-exact-approval-fields");
            }
            assertCondition(
                entry.endpoint === (controlled.has(id) ? "http://ulvia-provider:5103" : expected.endpoint),
                "metadata-provider-owned-endpoint",
            );
            assertCondition(
                Number.isSafeInteger(entry.revision) &&
                    Number(entry.revision) >= Number(expected.revision) &&
                    typeof entry.observedAt === "string" &&
                    Date.parse(entry.observedAt) >= Date.parse(String(expected.observedAt)) &&
                    Date.parse(entry.observedAt) <= Date.now() + 1000,
                "metadata-provider-monotonic-observation",
            );
            if (controlled.has(id)) {
                assertCondition(
                    entry.revision === expected.revision && entry.observedAt === expected.observedAt,
                    "metadata-provider-exact-controlled-observation",
                );
            }
            const selections = state.connections.selections;
            assertCondition(
                Array.isArray(selections) &&
                    entry.selectionCount ===
                        selections.filter((selection) => requireRecord(selection).installationId === id).length,
                "metadata-provider-known-selection-count",
            );
            seen.add(id);
        }
        assertProviderRoutes(row.routes, state);
    };
}
