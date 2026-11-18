import { expect, test } from "bun:test";
import { editedSnapshot, assertComposition } from "./oracle";

const snapshot = {
    name: "Original",
    group: "Owned",
    description: "Preserved",
    dependencies: ["basic-section"],
    structure: [
        {
            kind: "bloc",
            tag: "basic-section",
            attributes: { title: "Original title" },
            children: [
                { kind: "text", value: "Before" },
                { kind: "slot", slotId: "stable-slot" },
            ],
        },
    ],
    slots: [{ id: "stable-slot", label: "Body", accepts: [{ kind: "any-component" }] }],
    defaultContent: "Default content",
};
const before = {
    tag: "site-owned",
    name: "Original",
    group: "Owned",
    description: "Preserved",
    lifecycle: "active",
    draftRevision: 2,
    publishedRevision: 1,
    groupId: "group-owned",
    definitionId: "definition-owned",
    draftJson: JSON.stringify(snapshot),
    publishedJson: JSON.stringify({ ...snapshot, name: "Published" }),
};

test("composition edits preserve slot IDs, native attributes, defaults and publication while changing text", () => {
    const edited = JSON.parse(editedSnapshot(before.draftJson, "After é"));
    expect(edited.name).toBe("After é");
    expect(edited.structure[0].children[0].value).toBe("After é");
    expect(edited.structure[0].children[1]).toEqual({ kind: "slot", slotId: "stable-slot" });
    expect(edited.structure[0].attributes).toEqual(snapshot.structure[0]!.attributes);
    expect(edited.slots).toEqual(snapshot.slots);
    expect(edited.defaultContent).toBe(snapshot.defaultContent);
    expect(JSON.parse(before.draftJson)).toEqual(snapshot);
});

test("composition document oracles reject wrong ownership, revisions, publication and lost structure", () => {
    expect(() => assertComposition(before, before)).not.toThrow();
    const reordered = Object.fromEntries(Object.entries(snapshot).reverse());
    expect(() => assertComposition({ ...before, draftJson: JSON.stringify(reordered) }, before)).not.toThrow();
    for (const corrupt of [
        { ...before, tag: "site-foreign" },
        { ...before, definitionId: "replacement" },
        { ...before, groupId: "foreign" },
        { ...before, draftRevision: 1 },
        { ...before, publishedJson: null },
        { ...before, draftJson: JSON.stringify({ ...snapshot, slots: [] }) },
        { ...before, draftJson: JSON.stringify({ ...snapshot, structure: [] }) },
    ]) {
        expect(() => assertComposition(corrupt, before)).toThrow();
    }
});

test("identity reads must omit document payloads and still retain exact ownership and revisions", () => {
    const { draftJson: _draft, publishedJson: _published, ...identity } = before;
    expect(() => assertComposition(identity, before, true)).not.toThrow();
    expect(() => assertComposition(before, before, true)).toThrow("composition-identity-loaded-documents");
    expect(() => assertComposition({ ...identity, definitionId: "replacement" }, before, true)).toThrow();
});
