import { collectionDocument } from "../../fixtures";
import { collectionFixture } from "../examples/buildFixture";

export function colorCollection(style: string, viewJS?: string) {
    const source = collectionDocument({ label: "Theme" });
    source.theme = {
        label: "label",
        categories: [
            {
                id: "colors",
                label: "label",
                entries: [
                    { id: "accent", label: "label", type: "color", defaults: { light: "#123456", dark: "#abcdef" } },
                ],
            },
        ],
    };
    const panel = (source.blocs as Record<string, unknown>[])[0]!;
    panel.style = style;
    if (viewJS !== undefined) {
        panel.runtime = { browserAbi: "v1", viewJS };
    }
    return collectionFixture(source);
}
