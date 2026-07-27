const expectedSnapshotJson = `{
        "defaultContent": "<h1 slot=\\\"title\\\">Hello</h1><p>Body</p>",
        "dependencies": [
            "basic-container",
            "layout-shell"
        ],
        "description": "Reusable hero",
        "group": "Layout",
        "name": "Hero",
        "slots": [
            {
                "accepts": [
                    {
                        "kind": "component",
                        "tag": "basic-heading-1"
                    },
                    {
                        "accept": [
                            "image",
                            "video"
                        ],
                        "kind": "media"
                    }
                ],
                "id": "title",
                "label": "Title",
                "max": 1,
                "min": 1,
                "slot": "title"
            },
            {
                "accepts": [
                    {
                        "kind": "any-component"
                    }
                ],
                "id": "content",
                "label": "Content"
            }
        ],
        "structure": [
            {
                "attributes": {
                    "aria-label": "A \\\"<&",
                    "width": "wide"
                },
                "children": [
                    {
                        "kind": "slot",
                        "slotId": "title"
                    },
                    {
                        "kind": "slot",
                        "slotId": "content"
                    }
                ],
                "kind": "bloc",
                "tag": "basic-container"
            }
        ]
    }`;

export const expectedEditorSource = `import { Editor, registerEditor, type ContentSlot } from "@bernouy/cms-content/editor";

const slots: ContentSlot[] = [
    {
        "accepts": [
            {
                "kind": "component",
                "tag": "basic-heading-1"
            },
            {
                "accept": [
                    "image",
                    "video"
                ],
                "kind": "media"
            }
        ],
        "label": "Title",
        "max": 1,
        "min": 1,
        "slot": "title"
    },
    {
        "accepts": [
            {
                "kind": "any-component"
            }
        ],
        "label": "Content"
    }
];

export class SiteCompositeBlocEditor extends Editor {
    protected override contentSlots(): ContentSlot[] {
        return slots;
    }
}

registerEditor({ editor: SiteCompositeBlocEditor });
`;

export const expectedBuilderJson = `{
    "createdAt": "2026-07-01T10:00:00.000Z",
    "draft": ${expectedSnapshotJson},
    "draftRevision": 3,
    "id": "01-site-hero",
    "lifecycle": "active",
    "ownership": {
        "definitionId": "01-site-hero",
        "kind": "site-builder"
    },
    "published": ${expectedSnapshotJson},
    "publishedRevision": 2,
    "schema": "cms.site-bloc.v1",
    "tag": "site-hero",
    "updatedAt": "2026-07-02T11:30:00.000Z"
}
`;
