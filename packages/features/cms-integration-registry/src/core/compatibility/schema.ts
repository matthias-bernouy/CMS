import { isDeepStrictEqual } from "node:util";
import type {
    DeclarativeConnectorSchemaColumnContract,
    DeclarativeConnectorSchemaConstraintContract,
    DeclarativeConnectorSchemaContract,
    DeclarativeConnectorSchemaRelationContract,
} from "@bernouy/cms-integrations";
import type { CompatibilityChangeSink } from "./changes";

export function compareConnectorSchemas(
    baseline: DeclarativeConnectorSchemaContract,
    candidate: DeclarativeConnectorSchemaContract,
    path: string,
    add: CompatibilityChangeSink,
): void {
    compareNamed(baseline.namespaces, candidate.namespaces, path, "namespace", add, (previous, next, namespacePath) =>
        compareNamed(previous.relations, next.relations, namespacePath, "relation", add, (left, right, relationPath) =>
            compareRelation(left, right, relationPath, add),
        ),
    );
}

function compareRelation(
    baseline: DeclarativeConnectorSchemaRelationContract,
    candidate: DeclarativeConnectorSchemaRelationContract,
    path: string,
    add: CompatibilityChangeSink,
): void {
    compareNamed(baseline.columns, candidate.columns, `${path}.columns`, "column", add, (left, right, columnPath) =>
        compareColumn(left, right, columnPath, add),
    );
    compareNamed(
        baseline.constraints,
        candidate.constraints,
        `${path}.constraints`,
        "constraint",
        add,
        (left, right, constraintPath) => compareConstraint(left, right, constraintPath, add),
        "breaking",
    );
}

function compareColumn(
    baseline: DeclarativeConnectorSchemaColumnContract,
    candidate: DeclarativeConnectorSchemaColumnContract,
    path: string,
    add: CompatibilityChangeSink,
): void {
    if (baseline.type !== candidate.type) {
        const classification = classifyTypeChange(baseline.type, candidate.type);
        add(
            classification,
            "schema",
            classification === "additive"
                ? "column-type-widened"
                : classification === "breaking"
                  ? "column-type-narrowed"
                  : "column-type-unproven",
            path,
            `Column type changed from ${baseline.type} to ${candidate.type}`,
        );
    }
    if (baseline.nullable && !candidate.nullable) {
        add("breaking", "schema", "column-nullability-tightened", path, "Nullable column became required");
    } else if (!baseline.nullable && candidate.nullable) {
        add("additive", "schema", "column-nullability-relaxed", path, "Required column became nullable");
    }
    if (baseline.default !== candidate.default) {
        const classification =
            baseline.default === undefined && candidate.default !== undefined ? "additive" : "breaking";
        add(classification, "schema", "column-default-changed", path, "Column default changed");
    }
}

function classifyTypeChange(baseline: string, candidate: string): "additive" | "breaking" | "unknown" {
    const numericOrder = ["smallint", "integer", "bigint", "numeric"];
    const previousNumeric = numericOrder.indexOf(baseline);
    const nextNumeric = numericOrder.indexOf(candidate);
    if (previousNumeric >= 0 && nextNumeric >= 0) {
        return nextNumeric > previousNumeric ? "additive" : "breaking";
    }
    const previousText = textCapacity(baseline);
    const nextText = textCapacity(candidate);
    if (previousText !== null && nextText !== null) {
        return nextText > previousText ? "additive" : "breaking";
    }
    return "unknown";
}

function textCapacity(type: string): number | null {
    if (type === "text" || type === "character varying") {
        return Number.POSITIVE_INFINITY;
    }
    const bounded = /^character varying\(([1-9][0-9]*)\)$/.exec(type);
    return bounded ? Number(bounded[1]) : null;
}

function compareConstraint(
    baseline: DeclarativeConnectorSchemaConstraintContract,
    candidate: DeclarativeConnectorSchemaConstraintContract,
    path: string,
    add: CompatibilityChangeSink,
): void {
    if (!isDeepStrictEqual(baseline, candidate)) {
        add("breaking", "schema", "constraint-changed", path, "Public constraint changed or became more restrictive");
    }
}

function compareNamed<T extends { name: string }>(
    baseline: readonly T[],
    candidate: readonly T[],
    path: string,
    label: string,
    add: CompatibilityChangeSink,
    compareExisting: (baseline: T, candidate: T, path: string) => void,
    removedClassification: "breaking" | "additive" = "breaking",
): void {
    const previous = new Map(baseline.map((entry) => [entry.name, entry]));
    const next = new Map(candidate.map((entry) => [entry.name, entry]));
    for (const [name, entry] of previous) {
        const candidateEntry = next.get(name);
        const entryPath = `${path}.${name}`;
        if (!candidateEntry) {
            add(
                removedClassification,
                "schema",
                `${label}-removed`,
                entryPath,
                `Declared ${label} was removed or renamed`,
            );
            continue;
        }
        compareExisting(entry, candidateEntry, entryPath);
    }
    for (const [name, entry] of next) {
        if (previous.has(name)) {
            continue;
        }
        const entryPath = `${path}.${name}`;
        if (label === "column") {
            const column = entry as unknown as DeclarativeConnectorSchemaColumnContract;
            const compatible = column.nullable || column.default !== undefined;
            add(
                compatible ? "additive" : "breaking",
                "schema",
                compatible ? "column-added" : "required-column-added",
                entryPath,
                compatible ? "Nullable or defaulted column was added" : "Required column without a default was added",
            );
        } else if (label === "constraint") {
            add("breaking", "schema", "constraint-added", entryPath, "A new public constraint was added");
        } else {
            add("additive", "schema", `${label}-added`, entryPath, `Declared ${label} was added`);
        }
    }
}
