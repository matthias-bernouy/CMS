import { describe, expect, test } from "bun:test";
import type { EditorCatalogueItem } from "../../../packages/official-repository/collections/ulvia-official/blocs/admin/pages/ulvia-official-page-editor/runtime/model";
import {
    renderRootFields,
    renderSettings,
} from "../../../packages/official-repository/collections/ulvia-official/blocs/admin/pages/ulvia-official-page-editor/runtime/view/settings";

const item: EditorCatalogueItem = {
    id: "fixture-control",
    name: "Fixture",
    group: "Fixture",
    description: "",
    kind: "component",
    ownership: "code-managed",
    order: 0,
    defaultContent: "",
    authoringJson: JSON.stringify({
        root: { accepts: ["button", "a"] },
        settings: [
            {
                id: "tone",
                label: "Tone",
                type: "string",
                default: "base",
                control: { kind: "select", options: [{ value: "base", label: "Base" }] },
            },
            {
                id: "label",
                label: "Label",
                type: "string",
                default: "",
                control: { kind: "text" },
            },
            {
                id: "wide",
                label: "Wide",
                type: "boolean",
                default: false,
                control: { kind: "toggle" },
            },
        ],
    }),
};

describe("Page editor controls", () => {
    test("renders authoring fields through reusable official control Blocs", () => {
        const element = document.createElement("button");
        const roots = document.createElement("div");
        const settings = document.createElement("div");

        renderRootFields(roots, element, item, { linkUrl: "URL", nativeElement: "Element" });
        renderSettings(settings, element, item);

        expect(roots.querySelector('[cms-bloc="ulvia-official-select"] select[data-root-tag]')).not.toBeNull();
        expect(settings.querySelector('[cms-bloc="ulvia-official-select"] select[data-setting="tone"]')).not.toBeNull();
        expect(settings.querySelector('[cms-bloc="ulvia-official-input"] input[data-setting="label"]')).not.toBeNull();
        expect(
            settings.querySelector('[cms-bloc="ulvia-official-toggle"] input[data-setting="wide"][role="switch"]'),
        ).not.toBeNull();
    });
});
