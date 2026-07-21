import { SettingsView } from "../../../Settings/SettingsView/SettingsView";
import { Canvas } from "../../Canvas/Canvas";
import type { RepeatPicker } from "../../RepeatPicker/RepeatPicker";
import { RepeatPicker as RepeatPickerElement } from "../../RepeatPicker/RepeatPicker";
import { StructureTree } from "../../StructureTree/StructureTree";
import { TopBar } from "../../TopBar/TopBar";

export class ShellDomRefs {
    constructor(private readonly host: HTMLElement) {}

    get structureTree(): StructureTree {
        this.defineElement("cms-editor-v2-structure-tree", StructureTree);
        return this.upgrade(this.host.shadowRoot!.querySelector("cms-editor-v2-structure-tree")) as StructureTree;
    }

    get settings(): SettingsView {
        this.defineElement("cms-editor-v2-settings-view", SettingsView);
        return this.upgrade(this.host.shadowRoot!.querySelector("cms-editor-v2-settings-view")) as SettingsView;
    }

    get settingsTabs(): HTMLElement {
        return this.host.shadowRoot!.querySelector(".panel-tabs")!;
    }

    get canvas(): Canvas {
        this.defineElement("cms-editor-v2-canvas", Canvas);
        return this.upgrade(this.host.shadowRoot!.querySelector("cms-editor-v2-canvas")) as Canvas;
    }

    get topBar(): TopBar {
        this.defineElement("cms-editor-v2-topbar", TopBar);
        return this.upgrade(this.host.shadowRoot!.querySelector("cms-editor-v2-topbar")) as TopBar;
    }

    get repeatPicker(): RepeatPicker {
        let picker = this.host.shadowRoot!.querySelector<RepeatPicker>("cms-editor-v2-repeat-picker");
        if (!picker) {
            picker = new RepeatPickerElement();
            this.host.shadowRoot!.append(picker);
        }
        return picker;
    }

    get pageSettingsModal(): HTMLElement {
        return this.host.shadowRoot!.querySelector(".page-settings-modal")!;
    }

    pageField<T extends HTMLElement>(name: string): T {
        return this.host.shadowRoot!.querySelector<T>(`[data-page-field="${name}"]`)!;
    }

    private upgrade<T extends Element>(element: T | null): T | null {
        if (element) {
            customElements.upgrade(element);
        }
        return element;
    }

    private defineElement(tagName: string, constructor: CustomElementConstructor): void {
        if (customElements.get(tagName)) {
            return;
        }

        try {
            customElements.define(tagName, constructor);
        } catch {
            const ElementClass = class extends (constructor as { new (): HTMLElement }) {};
            customElements.define(tagName, ElementClass);
        }
    }
}
