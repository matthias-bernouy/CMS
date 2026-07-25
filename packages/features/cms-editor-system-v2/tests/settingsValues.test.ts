import { describe, expect, test } from "bun:test";
import { parseHTML } from "linkedom";
import { Editor, type ContentSlot, type SettingSection } from "@bernouy/cms-content/editor";
import {
    getTextValue,
    resolveSettingsValues,
    setTextValue,
} from "../src/components/Layout/Shell/Domain/Settings/settingsValues";
import { ShellSelection } from "../src/components/Layout/Shell/Controller/shellSelection";

function target(markup: string): HTMLElement {
    const { document } = parseHTML(`
        <!DOCTYPE html>
        <html>
            <body>${markup}</body>
        </html>
    `);

    return document.body.firstElementChild as HTMLElement;
}

class NavEditor extends Editor {
    protected override contentSlots(): ContentSlot[] {
        return [
            {
                label: "Dropdown",
                slot: "items",
                accepts: [{ kind: "any-component" }],
            },
        ];
    }
}

class DefaultSlotEditor extends Editor {
    protected override contentSlots(): ContentSlot[] {
        return [
            {
                label: "Content",
                accepts: [{ kind: "any-component" }],
            },
        ];
    }
}

describe("settings text values", () => {
    test("reads rich text from non-reserved direct content", () => {
        const editor = new NavEditor(
            target(
                `<base-nav-item>
                Home <strong>New</strong>
                <base-nav-item slot="items">Child</base-nav-item>
            </base-nav-item>`,
            ),
        );

        expect(getTextValue(editor, "richtext")).toBe(`Home <strong>New</strong>`);
    });

    test("writes rich text without replacing named content slot children", () => {
        const el = target(`<base-nav-item>Home<base-nav-item slot="items">Child</base-nav-item></base-nav-item>`);
        const editor = new NavEditor(el);

        setTextValue(editor, "richtext", `About <em>Us</em>`);

        expect(el.innerHTML).toBe(`About <em>Us</em><base-nav-item slot="items">Child</base-nav-item>`);
    });

    test("rejects unnamed content slots for text-capable editors", () => {
        const editor = new DefaultSlotEditor(target(`<demo-card>Content</demo-card>`));

        expect(() => getTextValue(editor, "richtext")).toThrow(
            "Editors cannot combine textCapability() with an unnamed content slot.",
        );
        expect(() => setTextValue(editor, "richtext", "Updated")).toThrow(
            "Editors cannot combine textCapability() with an unnamed content slot.",
        );
    });
});

describe("settings control values", () => {
    test("resolves both token and custom color attributes", () => {
        const editor = new Editor(target(`<demo-card background="custom" background-custom="#123456"></demo-card>`));
        const sections: SettingSection[] = [
            {
                kind: "self",
                label: "Appearance",
                settings: [
                    {
                        type: "color",
                        label: "Background",
                        attribute: "background",
                        defaultValue: "base",
                        tokens: [
                            { label: "Base", value: "base" },
                            { label: "Custom", value: "custom" },
                        ],
                        allowCustom: true,
                        customAttribute: "background-custom",
                        customDefaultValue: "#ffffff",
                    },
                ],
            },
        ];

        expect(resolveSettingsValues(editor, sections)).toEqual([
            {
                ...sections[0],
                settings: [
                    {
                        ...sections[0]!.settings[0],
                        defaultValue: "custom",
                        customDefaultValue: "#123456",
                    },
                ],
            },
        ]);
        expect(sections[0]!.settings[0]).toMatchObject({
            defaultValue: "base",
            customDefaultValue: "#ffffff",
        });
    });

    test("reads and writes inert image source settings", () => {
        const image = target(`<img data-cms-src="/media/{{ product.image }}.jpg">`);
        const editor = new Editor(image);
        const setting = {
            type: "text",
            label: "Source",
            attribute: "src",
            defaultValue: "",
        } as const;
        const sections: SettingSection[] = [
            {
                kind: "self",
                label: "Image",
                settings: [setting],
            },
        ];

        expect(resolveSettingsValues(editor, sections)[0]?.settings[0]).toMatchObject({
            defaultValue: "/media/{{ product.image }}.jpg",
        });

        const selection = new ShellSelection({} as never);
        selection.applySetting(editor, setting, "/media/{{ alternate.image }}.jpg");
        expect(image.getAttribute("src")).toBeNull();
        expect(image.getAttribute("data-cms-src")).toBe("/media/{{ alternate.image }}.jpg");

        selection.applySetting(editor, setting, "/media/static.jpg");
        expect(image.getAttribute("src")).toBeNull();
        expect(image.getAttribute("data-cms-src")).toBe("/media/static.jpg");

        selection.applySetting(editor, setting, "");
        expect(image.getAttribute("src")).toBeNull();
        expect(image.getAttribute("data-cms-src")).toBeNull();
    });
});
