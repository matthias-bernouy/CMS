import { projectObservedSchemaContract } from "@bernouy/cms-integrations";
import { ReviewedSchemaBaselineIntegrityError } from "../../../../core/compatibility/reportStoreErrors";
import type { ReviewedConnectorSchemaBaseline } from "../../../../interfaces/compatibility";
import type { ReviewedSchemaBaselineStore } from "../../../../interfaces/reportStore";

export async function loadReviewedConnectorSchemaBaselines(
    store: ReviewedSchemaBaselineStore,
    kind: string,
    version: string,
    packageDigest: string,
): Promise<readonly ReviewedConnectorSchemaBaseline[]> {
    const histories = await store.listForPackage(kind, version, packageDigest);
    return Object.freeze(
        histories.map((history) => {
            const baseline = history.current;
            if (
                baseline.kind !== kind ||
                baseline.version !== version ||
                baseline.packageDigest !== packageDigest ||
                history.logicalKey.kind !== kind ||
                history.logicalKey.version !== version ||
                history.logicalKey.packageDigest !== packageDigest
            ) {
                throw new ReviewedSchemaBaselineIntegrityError(
                    `Reviewed schema baseline changed immutable package identity for ${kind}@${version}`,
                );
            }
            return Object.freeze({
                connector: Object.freeze({ ...baseline.legacySelector }),
                packageDigest,
                schema: projectObservedSchemaContract(baseline.observedSchema),
                provenance: Object.freeze({
                    evidenceId: `reviewed-schema-baseline-${history.currentBaselineDigest}`,
                    source: `${baseline.origin}:${baseline.policy.name}@${baseline.policy.version}`,
                    reviewedAt: baseline.createdAt,
                }),
            });
        }),
    );
}
