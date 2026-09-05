import { describe, expect, test } from "bun:test";
import { parseHTML } from "linkedom";
import { Editor, type SettingSection } from "@bernouy/cms-content/editor";
import { ShellSelection } from "../src/components/Layout/Shell/Controller/shellSelection";
import {
    getTextValue,
    resolveSettingsValues,
    setTextValue,
} from "../src/components/Layout/Shell/Domain/Settings/settingsValues";

class ManagedNativeOwnerEditor extends Editor {
    constructor(
        target: HTMLElement,
        private readonly managed: Editor,
    ) {
        super(target);
    }

    override getManagedNativeEditor(): Editor {
        return this.managed;
    }
}

describe("managed native editor routing", () => {
    test("reads and writes text through the native child", () => {
        const host = target(`<demo-link><a href="/about">About</a></demo-link>`);
        const anchor = host.firstElementChild as HTMLElement;
        const editor = new ManagedNativeOwnerEditor(host, new Editor(anchor));

        expect(getTextValue(editor, "richtext")).toBe("About");
        setTextValue(editor, "richtext", "Our <strong>story</strong>");

        expect(host.innerHTML).toBe(`<a href="/about">Our <strong>story</strong></a>`);
    });

    test("resolves and applies native settings on the child", () => {
        const host = target(`<demo-link tone="accent"><a href="/before">Before</a></demo-link>`);
        const anchor = host.firstElementChild as HTMLElement;
        const editor = new ManagedNativeOwnerEditor(host, new Editor(anchor));
        const setting = {
            type: "page-link",
            label: "Destination",
            attribute: "href",
            required: true,
            allowPage: true,
            allowExternal: true,
            allowMedia: true,
            target: "managed-native",
        } as const;
        const sections: SettingSection[] = [{ kind: "self", label: "Link", settings: [setting] }];

        expect(resolveSettingsValues(editor, sections)[0]?.settings[0]).toMatchObject({
            defaultValue: "/before",
        });

        new ShellSelection({} as never).applySetting(editor, setting, "/after");

        expect(anchor.getAttribute("href")).toBe("/after");
        expect(host.getAttribute("href")).toBeNull();
    });
});

function target(markup: string): HTMLElement {
    const { document } = parseHTML(`<!DOCTYPE html><html><body>${markup}</body></html>`);
    return document.body.firstElementChild as HTMLElement;
}
