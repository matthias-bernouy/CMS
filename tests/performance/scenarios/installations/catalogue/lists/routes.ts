import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { assertCondition, requireRecord } from "../../../queries/types";
import type { MetadataListExpectation } from "./oracle";

export function assertProviderRoutes(output: unknown, state: MetadataListExpectation) {
    const expected = new Map<string, Map<string, unknown>>();
    const add = (
        providerId: string,
        accountId: string,
        installationId: string,
        implementations: readonly unknown[],
    ) => {
        for (const raw of implementations) {
            const implementation = requireRecord(raw);
            const contractId = String(implementation.contractId);
            const options = expected.get(contractId) ?? new Map();
            options.set(`${installationId}@${implementation.version}`, {
                providerId,
                accountId,
                status: implementation.status,
                selection: {
                    contractId,
                    version: implementation.version,
                    digest: implementation.digest,
                    installationId,
                },
            });
            expected.set(contractId, options);
        }
    };
    for (const baseline of state.connections.baseline) {
        assertCondition(Array.isArray(baseline.contracts));
        add(String(baseline.providerId), String(baseline.accountId), String(baseline.id), baseline.contracts);
    }
    for (const connection of state.connections.rows.values()) {
        const resource = state.resources.providers.find(
            (item) => item.id === connection.providerId && item.version === connection.manifestVersion,
        )!;
        add(
            connection.providerId,
            connection.accountId,
            connection.id,
            resource.admission.manifest.implementations.map(({ contractId, version, digest }) => ({
                contractId,
                version,
                digest,
                status: "ready",
            })),
        );
    }
    assertCondition(Array.isArray(output) && output.length === expected.size, "metadata-provider-complete-route-count");
    const seen = new Set<string>();
    for (const raw of output) {
        const route = requireRecord(raw);
        const id = String(route.contractId);
        const options = expected.get(id);
        assertCondition(
            options && !seen.has(id) && Array.isArray(route.options) && route.options.length === options.size,
            "metadata-provider-complete-known-route",
        );
        const optionKeys = new Set<string>();
        for (const rawOption of route.options) {
            const option = requireRecord(rawOption);
            const selection = requireRecord(option.selection);
            const key = `${selection.installationId}@${selection.version}`;
            assertCondition(
                !optionKeys.has(key) && canonicalizeIJson(option) === canonicalizeIJson(options.get(key)),
                "metadata-provider-known-route-option",
            );
            optionKeys.add(key);
        }
        const selections = state.connections.selections;
        assertCondition(Array.isArray(selections));
        const selected = selections.map(requireRecord).find((selection) => selection.contractId === id);
        assertCondition(
            route.selectedInstallationId === selected?.installationId && route.selectedDigest === selected?.digest,
            "metadata-provider-current-selected-route",
        );
        seen.add(id);
    }
}
