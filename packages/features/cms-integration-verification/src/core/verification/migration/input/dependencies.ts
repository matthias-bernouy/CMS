import type { MigrationVerificationInputV1 } from "../../../../interfaces/verification/migration";
import { parseVersionDigestReference } from "../../../reports/shared";
import { assertUnique, boundedArray, strictRecord } from "../../../validation/structure";
import { oneOf } from "../../../validation/values";
import { invalid, MAX_MIGRATION_DEPENDENCIES } from "../shared";

export function parseDependencyMatrices(
    value: unknown,
    targetKind: string,
): MigrationVerificationInputV1["dependencyMatrices"] {
    const matrices = boundedArray(value, "migrationVerificationInput.dependencyMatrices", parseDependencyMatrix, {
        minimum: 2,
        maximum: 2,
    });
    if (matrices[0]?.selection !== "minimum" || matrices[1]?.selection !== "stable") {
        invalid("migrationVerificationInput.dependencyMatrices", "must contain minimum then stable exactly once");
    }
    for (const matrix of matrices) {
        const kinds = matrix.dependencies.map((entry) => entry.kind);
        assertUnique(kinds, `migrationVerificationInput.dependencyMatrices.${matrix.selection}.dependencies.kind`);
        if (kinds.includes(targetKind)) {
            invalid(
                `migrationVerificationInput.dependencyMatrices.${matrix.selection}.dependencies`,
                "must not substitute the target integration kind",
            );
        }
    }
    return matrices as unknown as MigrationVerificationInputV1["dependencyMatrices"];
}

function parseDependencyMatrix(value: unknown, field: string) {
    const input = strictRecord(value, field, ["selection", "dependencies"]);
    return {
        selection: oneOf(input.selection, `${field}.selection`, ["minimum", "stable"] as const),
        dependencies: boundedArray(input.dependencies, `${field}.dependencies`, parseVersionDigestReference, {
            maximum: MAX_MIGRATION_DEPENDENCIES,
        }),
    };
}
