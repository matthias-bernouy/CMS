import type { DataScope, SettingControl } from "@bernouy/cms-content/editor";

type EmitTextValue = (value: string) => void;
type EmitToggleValue = (value: boolean) => void;

export function wireTextControl(
    control: HTMLElement,
    selector: "input" | "textarea" | "select",
    setting: SettingControl,
    emitValue: EmitTextValue,
): void {
    whenDefined(control, () => {
        const input = control.shadowRoot?.querySelector<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>(
            selector,
        );
        if (!input) {
            return;
        }
        input.disabled = setting.disabled === true;
        if (setting.disabled) {
            return;
        }
        input.addEventListener("input", () => emitValue(input.value));
        input.addEventListener("change", () => emitValue(input.value));
    });
}

export function wireContentControl(
    control: HTMLElement,
    selector: "input" | "textarea",
    emitValue: EmitTextValue,
): void {
    whenDefined(control, () => {
        const input = control.shadowRoot?.querySelector<HTMLInputElement | HTMLTextAreaElement>(selector);
        if (!input) {
            return;
        }
        input.addEventListener("input", () => emitValue(input.value));
        input.addEventListener("change", () => emitValue(input.value));
    });
}

export function wireRichTextControl(control: HTMLElement, emitValue: EmitTextValue): void {
    whenDefined(control, () => {
        control.addEventListener("input", (event) => {
            const value = (event as CustomEvent<{ value: string }>).detail?.value;
            if (typeof value === "string") {
                emitValue(value);
            }
        });
    });
}

export function wirePageLinkControl(control: HTMLElement, setting: SettingControl, emitValue: EmitTextValue): void {
    whenDefined(control, () => {
        if (setting.disabled) {
            return;
        }
        control.addEventListener("input", (event) => {
            const value = (event as CustomEvent<{ value: string }>).detail?.value;
            if (typeof value === "string") {
                emitValue(value);
            }
        });
    });
}

export function wireToggleControl(control: HTMLElement, setting: SettingControl, emitValue: EmitToggleValue): void {
    whenDefined(control, () => {
        const button = control.shadowRoot?.querySelector<HTMLButtonElement>("button");
        if (!button) {
            return;
        }
        button.disabled = setting.disabled === true;
        if (setting.disabled) {
            return;
        }
        button.addEventListener("click", () => {
            const checked = button.ariaPressed !== "true";
            button.ariaPressed = String(checked);
            control.toggleAttribute("checked", checked);
            emitValue(checked);
        });
    });
}

export function applyDisabled(control: HTMLElement, setting: SettingControl): void {
    control.toggleAttribute("disabled", setting.disabled === true);
    if (setting.disabled) {
        control.setAttribute("aria-disabled", "true");
    } else {
        control.removeAttribute("aria-disabled");
    }
}

export function setDataScopes(control: HTMLElement, dataScopes: DataScope[]): void {
    control.setAttribute("data-scopes", JSON.stringify(dataScopes));
}

function whenDefined(control: HTMLElement, callback: () => void): void {
    if (customElements.get(control.localName)) {
        callback();
    } else {
        customElements.whenDefined(control.localName).then(callback);
    }
}
