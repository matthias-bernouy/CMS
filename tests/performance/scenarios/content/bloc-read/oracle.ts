import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { assertCondition, requireRecord } from "../../queries/types";

export function assertBlocRead(
    capability: string,
    output: unknown,
    receipts: readonly Readonly<Record<string, unknown>>[],
    marker: string,
    tag?: string,
) {
    const row = requireRecord(output);
    if (capability === "site-blocs.get") {
        const expected = receipts.find((receipt) => receipt.tag === tag);
        assertCondition(expected && canonicalizeIJson(row) === canonicalizeIJson(expected), "bloc-read-exact-details");
        return;
    }
    assertCondition(Array.isArray(row.items), "bloc-read-items-missing");
    const items = row.items.map(requireRecord);
    const editor = capability === "pages.editor-catalogue";
    const compare = (a: Readonly<Record<string, unknown>>, b: Readonly<Record<string, unknown>>) =>
        editor
            ? String(a.group).localeCompare(String(b.group)) ||
              Number(a.order) - Number(b.order) ||
              String(a.name).localeCompare(String(b.name)) ||
              String(a.id).localeCompare(String(b.id))
            : String(a.name).localeCompare(String(b.name)) || String(a.tag).localeCompare(String(b.tag));
    assertCondition(canonicalizeIJson(items) === canonicalizeIJson([...items].sort(compare)), "bloc-read-order");
    const actual = items.filter((item) => String(item[editor ? "id" : "tag"]).startsWith(marker));
    const expected = editor
        ? receipts
              .filter((receipt) => receipt.publishedRevision !== null)
              .map((receipt) => ({
                  id: receipt.tag,
                  name: receipt.name,
                  group: receipt.group,
                  description: receipt.description,
                  kind: "composition",
                  ownership: "site-builder",
                  order: 0,
                  defaultContent: "",
                  authoringJson: '{"root":{"accepts":["div"]},"settings":[],"slots":{}}',
              }))
        : [...receipts];
    expected.sort(compare);
    assertCondition(canonicalizeIJson(actual) === canonicalizeIJson(expected), "bloc-read-exact-owned-items");
}
