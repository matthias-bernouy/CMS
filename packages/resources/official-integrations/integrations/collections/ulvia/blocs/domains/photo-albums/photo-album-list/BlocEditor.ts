import { Editor, registerEditor, type ContentSlot, type SettingSection } from "@bernouy/cms-content/editor";

export class PhotoAlbumListEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Catalogue",
                settings: [
                    { type: "text", label: "Albums per page", attribute: "page-size", defaultValue: "12" },
                    { type: "text", label: "Fixed category slug", attribute: "category" },
                    { type: "text", label: "Page URL parameter", attribute: "page-param", defaultValue: "page" },
                    {
                        type: "segmented",
                        label: "Synchronize page with URL",
                        attribute: "sync-url",
                        defaultValue: "true",
                        options: [
                            { label: "Yes", value: "true" },
                            { label: "No", value: "false" },
                        ],
                    },
                ],
            },
            {
                kind: "self",
                label: "Layout",
                settings: [
                    {
                        type: "select",
                        label: "Minimum card width",
                        attribute: "grid-min",
                        defaultValue: "sm",
                        options: ["sm", "md", "lg", "xl"].map((value) => ({ label: value, value })),
                    },
                    {
                        type: "select",
                        label: "Maximum card width",
                        attribute: "grid-max",
                        defaultValue: "lg",
                        options: ["none", "sm", "md", "lg", "xl"].map((value) => ({ label: value, value })),
                    },
                    {
                        type: "select",
                        label: "Grid gap",
                        attribute: "grid-gap",
                        defaultValue: "md",
                        options: ["none", "xs", "sm", "md", "lg", "xl"].map((value) => ({ label: value, value })),
                    },
                ],
            },
            {
                kind: "self",
                label: "Data",
                settings: [
                    {
                        type: "text",
                        label: "Photo Albums source",
                        attribute: "source-id",
                        defaultValue: "photo-albums",
                    },
                    {
                        type: "text",
                        label: "Source prefix",
                        attribute: "source-prefix",
                        defaultValue: "/.cms/sources",
                    },
                ],
            },
        ];
    }

    protected override contentSlots(): ContentSlot[] {
        const accepts = [{ kind: "any-component" as const }];
        return [
            { label: "Heading", slot: "heading", max: 1, accepts },
            { label: "Loading state", slot: "loading", max: 1, accepts },
            { label: "Error state", slot: "error", max: 1, accepts },
            { label: "Empty state", slot: "empty", max: 1, accepts },
            { label: "Album catalogue", slot: "catalogue", max: 1, accepts },
            { label: "Pagination", slot: "pagination", max: 1, accepts },
        ];
    }
}

registerEditor({ editor: PhotoAlbumListEditor });
