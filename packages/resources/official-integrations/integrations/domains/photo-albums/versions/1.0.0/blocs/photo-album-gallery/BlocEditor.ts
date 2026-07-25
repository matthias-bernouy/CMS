import { Editor, registerEditor, type ContentSlot, type SettingSection } from "@bernouy/cms-content/editor";

export class PhotoAlbumGalleryEditor extends Editor {
    protected override settings(): SettingSection[] {
        return [
            {
                kind: "self",
                label: "Album",
                settings: [
                    { type: "text", label: "Fixed album slug", attribute: "slug" },
                    { type: "text", label: "Slug URL parameter", attribute: "slug-param", defaultValue: "slug" },
                ],
            },
            {
                kind: "self",
                label: "Layout",
                settings: [
                    {
                        type: "select",
                        label: "Minimum photo width",
                        attribute: "grid-min",
                        defaultValue: "sm",
                        options: ["sm", "md", "lg", "xl"].map((value) => ({ label: value, value })),
                    },
                    {
                        type: "select",
                        label: "Maximum photo width",
                        attribute: "grid-max",
                        defaultValue: "none",
                        options: ["none", "sm", "md", "lg", "xl"].map((value) => ({ label: value, value })),
                    },
                    {
                        type: "select",
                        label: "Grid gap",
                        attribute: "grid-gap",
                        defaultValue: "sm",
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
            { label: "Loading state", slot: "loading", max: 1, accepts },
            { label: "Error state", slot: "error", max: 1, accepts },
            { label: "Album content", slot: "album", max: 1, accepts },
        ];
    }
}

registerEditor({ editor: PhotoAlbumGalleryEditor });
