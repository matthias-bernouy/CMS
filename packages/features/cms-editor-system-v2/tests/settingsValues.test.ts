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

    test("sanitizes native rich text to controlled inline semantics", () => {
        const el = target(`<p>Original</p>`);
        const editor = new Editor(el);

        setTextValue(
            editor,
            "richtext",
            `Hello <strong class="loud" onclick="attack()">Bold <em style="color:red">text</em></strong>
            <div id="layout">Block <code data-secret="value">code</code></div>
            <a href="java\nscript:alert(1)"><em>unsafe link</em></a>
            <a href=" /pages/about " target="_blank" rel="opener">safe link</a>
            <img src="/track" onerror="attack()"><script>attack()</script><!-- marker -->`,
        );

        expect(el.innerHTML.replace(/\s+/g, " ").trim()).toBe(
            `Hello <strong>Bold <em>text</em></strong> Block <code>code</code> <em>unsafe link</em> <a href="/pages/about">safe link</a>`,
        );
    });

    test("sanitizes native rich text when it is read without mutating the editor target", () => {
        const el = target(`<p><strong style="color:red">Safe</strong><iframe src="/tracker">Hidden</iframe></p>`);
        const editor = new Editor(el);

        expect(getTextValue(editor, "richtext")).toBe(`<strong>Safe</strong>`);
        expect(el.querySelector("strong")?.hasAttribute("style")).toBeTrue();
        expect(el.querySelector("iframe")).not.toBeNull();
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

    test("reads inert image source settings and rejects an uncontrolled native text field", () => {
        const image = target(`<img data-cms-src="/media/{{ product.image }}.jpg" alt="Product">`);
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
        expect(image.getAttribute("data-cms-src")).toBe("/media/{{ product.image }}.jpg");

        selection.applySetting(editor, setting, "/media/static.jpg");
        expect(image.getAttribute("src")).toBeNull();
        expect(image.getAttribute("data-cms-src")).toBe("/media/{{ product.image }}.jpg");

        selection.applySetting(editor, setting, "");
        expect(image.getAttribute("src")).toBeNull();
        expect(image.getAttribute("data-cms-src")).toBe("/media/{{ product.image }}.jpg");

        selection.applySetting(
            editor,
            {
                type: "page-link",
                label: "Image",
                attribute: "src",
                required: true,
                allowPage: false,
                allowExternal: false,
                allowMedia: true,
                mediaAccept: ["image"],
            },
            "/.cms/files/by-id/photo",
        );
        expect(image.getAttribute("data-cms-src")).toBe("/.cms/files/by-id/photo");
    });
});
