import type { SettingsView } from "../../../Settings/SettingsView/SettingsView";
import type { Canvas } from "../../Canvas/Canvas";
import type { RepeatPicker } from "../../RepeatPicker/RepeatPicker";
import { RepeatPicker as RepeatPickerElement } from "../../RepeatPicker/RepeatPicker";
import type { StructureTree } from "../../StructureTree/StructureTree";
import type { TopBar } from "../../TopBar/TopBar";

export class ShellDomRefs {
    constructor(private readonly host: HTMLElement) {}

    get structureTree(): StructureTree {
        return this.host.shadowRoot!.querySelector("cms-editor-v2-structure-tree") as StructureTree;
    }

    get settings(): SettingsView {
        return this.host.shadowRoot!.querySelector("cms-editor-v2-settings-view") as SettingsView;
    }

    get settingsTabs(): HTMLElement {
        return this.host.shadowRoot!.querySelector(".panel-tabs")!;
    }

    get canvas(): Canvas {
        return this.host.shadowRoot!.querySelector("cms-editor-v2-canvas") as Canvas;
    }

    get topBar(): TopBar {
        return this.host.shadowRoot!.querySelector("cms-editor-v2-topbar") as TopBar;
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
}
