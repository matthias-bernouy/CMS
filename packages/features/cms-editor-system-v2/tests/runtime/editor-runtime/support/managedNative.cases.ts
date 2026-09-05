import {
    Editor,
    EditorRuntime,
    blocConstructor,
    describe,
    expect,
    parseHTML,
    test,
    type SettingSection,
} from "./index";

describe("EditorRuntime managed native elements", () => {
    test("flattens a required managed native child into its owning bloc", () => {
        const { document, HTMLElement } = parseHTML(`
            <!DOCTYPE html>
            <html>
                <body>
                    <main id="content-root">
                        <x-managed-link id="link"><a id="anchor" href="/about">About</a></x-managed-link>
                    </main>
                </body>
            </html>
        `);
        class ManagedLinkEditor extends Editor {
            protected override settings(): SettingSection[] {
                return [
                    {
                        kind: "self",
                        label: "Style",
                        settings: [{ type: "text", label: "Tone", attribute: "tone" }],
                    },
                ];
            }
        }
        class AnchorEditor extends Editor {
            protected override settings(): SettingSection[] {
                return [
                    {
                        kind: "self",
                        label: "Link",
                        settings: [
                            {
                                type: "page-link",
                                label: "Destination",
                                attribute: "href",
                                allowPage: true,
                                allowExternal: true,
                                allowMedia: true,
                            },
                        ],
                    },
                ];
            }

            protected override textCapability() {
                return { format: "richtext" as const, bold: true };
            }
        }
        const runtime = new EditorRuntime([
            {
                tag: "x-managed-link",
                label: "Managed link",
                nativeElement: "a",
                bloc: blocConstructor(HTMLElement),
                editor: ManagedLinkEditor,
            },
            {
                tag: "a",
                label: "Link",
                bloc: blocConstructor(HTMLElement),
                editor: AnchorEditor,
            },
        ]);
        const contentRoot = document.getElementById("content-root")!;
        const host = document.getElementById("link")!;
        const anchor = document.getElementById("anchor")!;

        runtime.load({ root: contentRoot, contentRoot });

        expect(runtime.getStructure().map((node) => node.target)).toEqual([host]);
        expect(runtime.getStructure()[0]?.children).toEqual([]);
        expect(runtime.getClosestEditor(anchor)?.target).toBe(host);
        expect(runtime.select(anchor)?.editor.target).toBe(host);
        expect(runtime.getSelection()?.textCapability).toEqual({ format: "richtext", bold: true });
        expect(runtime.getSelectedSettings()).toEqual([
            {
                kind: "self",
                label: "Style",
                settings: [{ type: "text", label: "Tone", attribute: "tone" }],
            },
            {
                kind: "self",
                label: "Link",
                settings: [
                    {
                        type: "page-link",
                        label: "Destination",
                        attribute: "href",
                        allowPage: true,
                        allowExternal: true,
                        allowMedia: true,
                        target: "managed-native",
                    },
                ],
            },
        ]);
    });
});
