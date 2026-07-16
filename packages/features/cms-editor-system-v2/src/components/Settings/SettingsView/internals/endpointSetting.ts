import type {
    EndpointPickerSetting,
    SettingControl,
    SettingLabelDisplay,
} from "@bernouy/cms-content/editor";
import type { EditorDataSource } from "../../../../runtime";
import {
    DataSourcePicker,
    DATA_SOURCE_PICKER_REMOVE_EVENT,
    DATA_SOURCE_PICKER_SELECT_EVENT,
    type DataSourcePickerSelectDetail,
} from "../../../Layout/DataSourcePicker/DataSourcePicker";
import {
    endpointAttributes,
    endpointOptions,
    endpointValue,
    initialEndpointBinding,
    removedEndpointAttributes,
    selectedEndpoint,
} from "./endpointBinding";
import type { SettingsViewAttributeChanges } from "../SettingsView";

type RenderFieldLabel = (label: string, display: SettingLabelDisplay | undefined) => HTMLElement | null;
type EmitSettingChange = (
    setting: SettingControl,
    value: string | boolean,
    attributes?: SettingsViewAttributeChanges,
) => void;

export class EndpointSettingController {
    private dataSources: EditorDataSource[] = [];
    private picker: DataSourcePicker | null = null;
    private disconnectPickerEvents: (() => void) | null = null;

    constructor(
        private readonly root: ShadowRoot,
        private readonly renderFieldLabel: RenderFieldLabel,
        private readonly emitSettingChange: EmitSettingChange,
    ) {}

    setDataSources(dataSources: EditorDataSource[]): void {
        this.dataSources = dataSources;
    }

    render(setting: EndpointPickerSetting): HTMLElement {
        const wrapper = document.createElement("div");
        wrapper.className = "field endpoint-field";
        const label = this.renderFieldLabel(setting.label, setting.labelDisplay);
        const button = document.createElement("button");
        button.className = "endpoint-button";
        button.type = "button";
        button.ariaLabel = setting.ariaLabel ?? setting.label;
        button.disabled = setting.disabled === true;
        this.syncButton(button, setting);
        if (!setting.disabled) button.addEventListener("click", () => this.open(setting, button));

        if (label) wrapper.append(label);
        wrapper.append(button);
        if (setting.help) {
            const help = document.createElement("div");
            help.className = "field-help";
            help.textContent = setting.help;
            wrapper.append(help);
        }
        return wrapper;
    }

    private syncButton(
        button: HTMLButtonElement,
        setting: EndpointPickerSetting,
        selected: EditorDataSource | null = selectedEndpoint(setting, this.dataSources),
        fallbackValue = setting.defaultValue,
    ): void {
        button.replaceChildren();
        const method = selected?.method ?? setting.defaultMethod;
        if (method) {
            const badge = document.createElement("span");
            badge.className = "endpoint-method";
            badge.textContent = method;
            button.append(badge);
        }
        const value = document.createElement("span");
        value.className = selected ? "endpoint-value" : "endpoint-placeholder";
        value.textContent = selected?.label ?? fallbackValue ?? setting.placeholder ?? "Select endpoint";
        button.append(value);
    }

    private open(setting: EndpointPickerSetting, button: HTMLButtonElement): void {
        const picker = this.ensurePicker();
        this.disconnectPickerEvents?.();
        const onSelect = (event: Event): void => {
            this.disconnectPickerEvents?.();
            const detail = (event as CustomEvent<DataSourcePickerSelectDetail>).detail;
            const value = endpointValue(setting, detail);
            this.syncButton(button, setting, detail.source, value);
            this.emitSettingChange(setting, value, endpointAttributes(setting, detail, value));
        };
        const onRemove = (): void => {
            this.disconnectPickerEvents?.();
            this.syncButton(button, setting, null, "");
            this.emitSettingChange(setting, "", removedEndpointAttributes(setting));
        };
        const cleanup = (): void => {
            picker.removeEventListener(DATA_SOURCE_PICKER_SELECT_EVENT, onSelect);
            picker.removeEventListener(DATA_SOURCE_PICKER_REMOVE_EVENT, onRemove);
            if (this.disconnectPickerEvents === cleanup) this.disconnectPickerEvents = null;
        };
        this.disconnectPickerEvents = cleanup;
        picker.addEventListener(DATA_SOURCE_PICKER_SELECT_EVENT, onSelect);
        picker.addEventListener(DATA_SOURCE_PICKER_REMOVE_EVENT, onRemove);
        picker.open(endpointOptions(setting, this.dataSources), setting.label, {
            canRemove: setting.required !== true && Boolean(setting.defaultValue),
            initialBinding: initialEndpointBinding(setting),
        });
    }

    private ensurePicker(): DataSourcePicker {
        if (this.picker) return this.picker;
        this.picker = new DataSourcePicker();
        this.root.append(this.picker);
        return this.picker;
    }
}
