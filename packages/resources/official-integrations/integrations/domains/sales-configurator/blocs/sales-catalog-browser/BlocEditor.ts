import { Editor, registerEditor, type ContentSlot, type SettingSection } from "@bernouy/cms-content/editor";

export class SalesCatalogBrowserEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Data",
                settings: [
                    {
                        type: "text",
                        label: "Source id",
                        attribute: "source-id",
                        defaultValue: "sales-configurator",
                    },
                ],
            },
            {
                kind: "self",
                label: "Formatting",
                settings: [
                    {
                        type: "text",
                        label: "Locale",
                        attribute: "locale",
                        defaultValue: "fr-FR",
                    },
                ],
            },
        ];
    }

    protected override contentSlots(): ContentSlot[] {
        return [{ label: "Catalog browser content", accepts: [{ kind: "any-component" }], min: 1 }];
    }
}

registerEditor({ editor: SalesCatalogBrowserEditor });
