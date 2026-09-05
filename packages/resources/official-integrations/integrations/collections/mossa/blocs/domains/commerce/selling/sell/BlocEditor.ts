import { Editor, registerEditor, type ContentSlot, type SettingSection } from "@bernouy/cms-content/editor";
import { sellCopySlots } from "./copySlots";

export class SellEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Valuation",
                settings: [
                    { type: "text", label: "Currency", attribute: "currency", defaultValue: "USD" },
                    {
                        type: "text",
                        label: "Minimum value field",
                        attribute: "valuation-minimum-field",
                        defaultValue: "valuationMinimum",
                    },
                    {
                        type: "text",
                        label: "Maximum value field",
                        attribute: "valuation-maximum-field",
                        defaultValue: "valuationMaximum",
                    },
                ],
            },
            {
                kind: "self",
                label: "Photos",
                settings: [
                    { type: "text", label: "Minimum photos", attribute: "minimum-photos", defaultValue: "3" },
                    { type: "text", label: "Maximum photos", attribute: "maximum-photos", defaultValue: "8" },
                ],
            },
        ];
    }

    protected override contentSlots(): ContentSlot[] {
        return [
            { label: "Sign-in action", slot: "auth-link", accepts: [{ kind: "any-component" }], min: 1, max: 1 },
            { label: "Photo guide", slot: "photo-guide", accepts: [{ kind: "any-component" }], max: 1 },
            {
                label: "Success navigation",
                slot: "success-navigation",
                accepts: [{ kind: "any-component" }],
                min: 1,
                max: 1,
            },
            ...sellCopySlots,
        ];
    }
}

registerEditor({ editor: SellEditor });
