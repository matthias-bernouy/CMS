import type { BlockPickerModal } from "../../../../Pickers/BlockPickerModal/BlockPickerModal";
import { ConditionPicker } from "../../../../Pickers/ConditionPicker/ConditionPicker";
import { DataSourcePicker } from "../../../../Pickers/DataSourcePicker/DataSourcePicker";

export class StructureTreeRefs {
    constructor(private readonly host: HTMLElement) {}

    get contextMenu(): HTMLElement {
        let menu = this.host.shadowRoot!.querySelector<HTMLElement>(".context-menu");
        if (!menu) {
            menu = document.createElement("div");
            menu.className = "context-menu";
            menu.setAttribute("role", "menu");
        }
        return menu;
    }

    get tree(): HTMLElement {
        return this.host.shadowRoot!.querySelector<HTMLElement>(".structure-tree")!;
    }

    get scrollContainer(): HTMLElement {
        const panelBody = this.host.parentElement?.shadowRoot?.querySelector<HTMLElement>(".panel-body");
        if (panelBody) {
            return panelBody;
        }
        return this.host;
    }

    get blockPicker(): BlockPickerModal {
        let picker = this.host.shadowRoot!.querySelector<BlockPickerModal>("cms-editor-v2-block-picker-modal");
        if (!picker) {
            picker = document.createElement("cms-editor-v2-block-picker-modal") as BlockPickerModal;
            this.host.shadowRoot!.append(picker);
        }
        return picker;
    }

    get dataSourcePicker(): DataSourcePicker {
        let picker = this.host.shadowRoot!.querySelector<DataSourcePicker>("cms-editor-v2-data-source-picker");
        if (!picker) {
            picker = new DataSourcePicker();
            this.host.shadowRoot!.append(picker);
        }
        return picker;
    }

    get conditionPicker(): ConditionPicker {
        let picker = this.host.shadowRoot!.querySelector<ConditionPicker>("cms-editor-v2-condition-picker");
        if (!picker) {
            picker = new ConditionPicker();
            this.host.shadowRoot!.append(picker);
        }
        return picker;
    }
}
