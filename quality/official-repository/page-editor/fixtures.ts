import type { EditorCatalogueItem } from "../../../packages/official-repository/collections/ulvia-official/blocs/admin/pages/ulvia-official-page-editor/runtime/model";

export const heading: EditorCatalogueItem = {
    id: "ulvia-official-heading",
    name: "Heading",
    group: "Content",
    description: "",
    kind: "component",
    ownership: "code-managed",
    order: 0,
    defaultContent: "Heading",
    authoringJson: JSON.stringify({
        root: { accepts: ["h2", "h1", "h3"] },
        slots: { "": { accepts: [{ kind: "native-content", profile: "phrasing" }] } },
    }),
};
