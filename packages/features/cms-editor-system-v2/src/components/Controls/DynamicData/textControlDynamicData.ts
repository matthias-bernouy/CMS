import { DynamicDataPickerController } from "./DynamicDataPickerController";

type TextControl = HTMLInputElement | HTMLTextAreaElement;

export class TextControlDynamicData {
    private _selectionStart = 0;
    private _selectionEnd = 0;
    private readonly _picker: DynamicDataPickerController;

    constructor(
        private readonly _refs: {
            host: () => HTMLElement;
            control: () => TextControl;
            button: () => HTMLButtonElement;
            picker: () => HTMLElement;
            search: () => HTMLInputElement;
            list: () => HTMLElement;
            closeButton: () => HTMLButtonElement;
        },
    ) {
        this._picker = new DynamicDataPickerController({
            picker:      () => this._refs.picker(),
            search:      () => this._refs.search(),
            list:        () => this._refs.list(),
            closeButton: () => this._refs.closeButton(),
            rawScopes:   () => this._refs.host().getAttribute("data-scopes"),
        }, {
            saveSelection:    this.saveSelection,
            restoreSelection: this.restoreSelection,
            insertText:       (text) => this.insertText(text),
            focusControl:     () => this._refs.control().focus(),
            finish:           this.emitInput,
        });
    }

    connect(): void {
        this.sync();
        this._refs.control().addEventListener("keyup", this.saveSelection);
        this._refs.control().addEventListener("mouseup", this.saveSelection);
        this._refs.control().addEventListener("select", this.saveSelection);
        this._refs.control().addEventListener("blur", this.saveSelection);
        this._refs.button().addEventListener("pointerdown", this.openPicker);
        this._refs.button().addEventListener("click", this.openPicker);
        this._picker.connect();
    }

    disconnect(): void {
        this._refs.control().removeEventListener("keyup", this.saveSelection);
        this._refs.control().removeEventListener("mouseup", this.saveSelection);
        this._refs.control().removeEventListener("select", this.saveSelection);
        this._refs.control().removeEventListener("blur", this.saveSelection);
        this._refs.button().removeEventListener("pointerdown", this.openPicker);
        this._refs.button().removeEventListener("click", this.openPicker);
        this._picker.disconnect();
    }

    sync(): void {
        const enabled = this._refs.host().hasAttribute("data-scopes") && !this._refs.host().hasAttribute("disabled");
        this._refs.button().hidden = !enabled;
        this._refs.button().disabled = !enabled;
        if (!enabled) this._refs.picker().hidden = true;
        this.saveSelection();
    }

    private readonly openPicker = (event: Event): void => {
        event.preventDefault();
        event.stopPropagation();
        if (this._refs.button().disabled) return;
        this._picker.open();
    };

    private readonly saveSelection = (): void => {
        const control = this._refs.control();
        this._selectionStart = control.selectionStart ?? control.value.length;
        this._selectionEnd = control.selectionEnd ?? this._selectionStart;
    };

    private restoreSelection = (): void => {
        this._refs.control().setSelectionRange?.(this._selectionStart, this._selectionEnd);
    };

    private insertText(text: string): void {
        const control = this._refs.control();
        const start = control.selectionStart ?? this._selectionStart;
        const end = control.selectionEnd ?? this._selectionEnd;
        control.value = `${control.value.slice(0, start)}${text}${control.value.slice(end)}`;
        const next = start + text.length;
        control.setSelectionRange?.(next, next);
        this.saveSelection();
    }

    private readonly emitInput = (): void => {
        this._refs.control().dispatchEvent(new Event("input", {
            bubbles: true,
        }));
    };
}
