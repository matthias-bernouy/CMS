import { Editor, registerEditor, type ColorSetting, type SettingSection } from "@bernouy/cms-content/editor";

const color = (label: string, attribute: string): ColorSetting => ({ type: "color", label, attribute });

export class CommerceMondialRelaySaleFulfillmentEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Sale",
                settings: [
                    { type: "text", label: "Order identifier", attribute: "order-id" },
                    { type: "text", label: "Query parameter", attribute: "order-param", defaultValue: "orderId" },
                ],
            },
            {
                kind: "self",
                label: "Content",
                settings: [
                    { type: "text", label: "Title", attribute: "title" },
                    { type: "textarea", label: "Description", attribute: "copy" },
                    { type: "text", label: "Create label", attribute: "create-label" },
                    { type: "text", label: "Retry", attribute: "retry-label" },
                    { type: "text", label: "Download label", attribute: "label-label" },
                    { type: "text", label: "Redownload label", attribute: "redownload-label" },
                    { type: "text", label: "Declare carrier handoff", attribute: "handoff-label" },
                    { type: "text", label: "Track parcel", attribute: "tracking-label" },
                ],
            },
            {
                kind: "self",
                label: "Colors",
                settings: [
                    color("Accent", "accent-color"),
                    color("Background", "background-color"),
                    color("Border", "border-color"),
                    color("Text", "text-color"),
                    color("Primary button text", "button-text-color"),
                ],
            },
        ];
    }
}

registerEditor({ editor: CommerceMondialRelaySaleFulfillmentEditor });
