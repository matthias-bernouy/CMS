import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { assertCondition, requireRecord } from "../../queries/types";

/** Preserve structural identities and slots while changing only text and display metadata. */
export function editedSnapshot(source: unknown, marker: string) {
    assertCondition(typeof source === "string", "composition-source-missing");
    const draft = requireRecord(JSON.parse(source));
    assertCondition(Array.isArray(draft.structure) && Array.isArray(draft.slots), "composition-structure-missing");
    const rewrite = (node: unknown): unknown => {
        const row = requireRecord(node);
        if (row.kind === "text") {
            return { ...row, value: marker };
        }
        return Array.isArray(row.children) ? { ...row, children: row.children.map(rewrite) } : row;
    };
    return JSON.stringify({ ...draft, name: marker, structure: draft.structure.map(rewrite) });
}

export function assertComposition(value: unknown, expected: Readonly<Record<string, unknown>>, identity = false) {
    const actual = requireRecord(value);
    for (const field of [
        "tag",
        "name",
        "group",
        "description",
        "lifecycle",
        "draftRevision",
        "publishedRevision",
        "groupId",
        "definitionId",
    ]) {
        assertCondition(actual[field] === expected[field], `composition-${field}-mismatch`);
    }
    if (identity) {
        assertCondition(
            !Object.hasOwn(actual, "draftJson") && !Object.hasOwn(actual, "publishedJson"),
            "composition-identity-loaded-documents",
        );
        return;
    }
    assertCondition(
        typeof actual.draftJson === "string" && typeof expected.draftJson === "string",
        "composition-draft-missing",
    );
    assertCondition(
        canonicalizeIJson(JSON.parse(actual.draftJson)) === canonicalizeIJson(JSON.parse(expected.draftJson)),
        "composition-draft-mismatch",
    );
    assertCondition(actual.publishedJson === expected.publishedJson, "composition-publication-mutated");
}

/** Expand only the draft while retaining a valid small publication as an independent anchor. */
export function largeSnapshot(source: unknown) {
    assertCondition(typeof source === "string", "composition-source-missing");
    const draft = requireRecord(JSON.parse(source));
    assertCondition(
        Array.isArray(draft.structure) &&
            draft.structure.length > 0 &&
            Array.isArray(draft.slots) &&
            draft.slots.length === 0,
        "composition-large-fixture-structure",
    );
    const root = draft.structure[0];
    const value = JSON.stringify({ ...draft, structure: Array.from({ length: 512 }, () => root) });
    assertCondition(
        Buffer.byteLength(value) > 64 * 1024 && Buffer.byteLength(value) < 4 * 1024 ** 2,
        "composition-large-fixture-volume",
    );
    return value;
}
