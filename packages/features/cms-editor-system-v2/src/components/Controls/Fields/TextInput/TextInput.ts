import templateHtml from "./template.html" with { type: "text" };
import componentCss from "./style.css" with { type: "text" };
import dynamicDataCss from "../../DynamicData/dynamicDataPicker.css" with { type: "text" };
import { TextControlDynamicData } from "../../DynamicData/textControlDynamicData";
import { attachFieldShadow, createFieldTemplate, syncFieldCopy } from "../fieldElement";

const template = createFieldTemplate(templateHtml, `${String(componentCss)}${String(dynamicDataCss)}`);

export class TextInput extends HTMLElement {
    private _connected = false;
    private readonly _dynamicData = new TextControlDynamicData({
        host:        () => this,
        control:     () => this.input,
        button:      () => this.dynamicDataButton,
        picker:      () => this.dataPicker,
        search:      () => this.dataSearch,
        list:        () => this.dataList,
        closeButton: () => this.closeDataButton,
    });

    constructor() {
        super();
        attachFieldShadow(this, template);
    }

    connectedCallback(): void {
        syncFieldCopy(this);
        const input = this.shadowRoot!.querySelector<HTMLInputElement>("input")!;
        input.value = this.getAttribute("value") ?? "";
        input.placeholder = this.getAttribute("placeholder") ?? "";
        if (this._connected) {
            this._dynamicData.sync();
            return;
        }
        this._connected = true;
        this._dynamicData.connect();
    }

    disconnectedCallback(): void {
        this._connected = false;
        this._dynamicData.disconnect();
    }

    private query<T extends Element>(selector: string): T {
        return this.shadowRoot!.querySelector<T>(selector)!;
    }

    private get input(): HTMLInputElement { return this.query("input"); }

    private get dynamicDataButton(): HTMLButtonElement { return this.query(".dynamic-data-tool"); }

    private get dataPicker(): HTMLElement { return this.query(".data-picker"); }

    private get dataSearch(): HTMLInputElement { return this.query(".data-search"); }

    private get dataList(): HTMLElement { return this.query(".data-list"); }

    private get closeDataButton(): HTMLButtonElement { return this.query(".close-data"); }
}

if (!customElements.get("cms-editor-v2-text-input")) {
    customElements.define("cms-editor-v2-text-input", TextInput);
}
