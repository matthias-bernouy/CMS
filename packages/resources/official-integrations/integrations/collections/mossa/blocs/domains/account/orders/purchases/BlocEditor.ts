import { Editor, registerEditor, type SettingSection } from "@bernouy/cms-content/editor";
import { purchaseCopy } from "./copy";

export class PurchaseListEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Status messages",
                settings: Object.entries(purchaseCopy).map(([attribute, text]) => ({
                    type: "text",
                    label: attribute.replaceAll("-", " "),
                    attribute,
                    defaultValue: text,
                })),
            },
            {
                kind: "self",
                label: "Navigation",
                settings: [{ type: "text", label: "Order URL pattern", attribute: "order-url" }],
            },
        ];
    }
}

registerEditor({ editor: PurchaseListEditor });
