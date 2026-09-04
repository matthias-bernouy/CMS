import { Editor, registerEditor, type ContentSlot, type SettingSection } from "@bernouy/cms-content/editor";

const anyComponent = [{ kind: "any-component" as const }];

export class OfferDetailEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Offer detail",
                settings: [
                    {
                        type: "segmented",
                        label: "Column balance",
                        attribute: "balance",
                        defaultValue: "even",
                        options: [
                            { label: "Media", value: "media-heavy" },
                            { label: "Even", value: "even" },
                            { label: "Information", value: "information-heavy" },
                        ],
                    },
                    {
                        type: "segmented",
                        label: "Main media ratio",
                        attribute: "ratio",
                        defaultValue: "landscape",
                        options: [
                            { label: "Square", value: "square" },
                            { label: "Landscape", value: "landscape" },
                            { label: "Wide", value: "wide" },
                        ],
                    },
                ],
            },
        ];
    }

    protected override contentSlots(): ContentSlot[] {
        return [
            {
                label: "Main media",
                slot: "main-media",
                min: 1,
                max: 1,
                accepts: [{ kind: "media", accept: ["image", "svg"] }],
            },
            {
                label: "Thumbnails",
                slot: "thumbnails",
                max: 6,
                accepts: [{ kind: "media", accept: ["image", "svg"] }],
            },
            { label: "Title", slot: "title", min: 1, max: 1, accepts: anyComponent },
            { label: "Metadata", slot: "meta", max: 1, accepts: anyComponent },
            { label: "Badge", slot: "badge", max: 1, accepts: anyComponent },
            { label: "Description", slot: "description", max: 1, accepts: anyComponent },
            { label: "Valuation", slot: "valuation", max: 1, accepts: anyComponent },
            { label: "Price", slot: "price", max: 1, accepts: anyComponent },
            { label: "Specifications", slot: "specifications", max: 1, accepts: anyComponent },
            { label: "Shipping", slot: "shipping", max: 1, accepts: anyComponent },
            { label: "Actions", slot: "actions", accepts: anyComponent },
        ];
    }
}

registerEditor({ editor: OfferDetailEditor });
