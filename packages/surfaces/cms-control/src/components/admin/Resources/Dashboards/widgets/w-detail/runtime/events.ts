import {
    emitWidgetEvent,
    WIDGET_ACTION_EVENT,
    WIDGET_BACK_EVENT,
    WIDGET_FIELD_CHANGE_EVENT,
    WIDGET_MEDIA_ACTION_EVENT,
} from "../../shared";
import { W_MEDIA_FIELD_ACTION_EVENT, type DashboardMediaActionDetail } from "../../w-media-field/types";
import { readFieldControlValue } from "../controls";
import type { WDetailData } from "../types";
import { DetailFieldState, parseJson, type DetailWidget } from "./fieldState";
import { DetailLookups } from "./lookups";
import { DetailSchemasState } from "./schemas";
import { addTableRow, removeTableRow, toggleChip, updateDerivedTables } from "./tableValues";

export class DetailEvents {
    private bound = false;

    constructor(
        private readonly host: HTMLElement,
        private readonly root: ShadowRoot,
        private readonly fields: DetailFieldState,
        private readonly lookups: DetailLookups,
        private readonly schemas: DetailSchemasState,
        private readonly isBound: () => boolean,
        private readonly readData: () => WDetailData,
        private readonly refreshConditionalFields: () => void,
    ) {}

    bind(): void {
        if (this.bound) {
            return;
        }
        this.root.addEventListener("click", this.onClick);
        this.root.addEventListener("input", this.onInput);
        this.root.addEventListener("change", this.onChange);
        this.root.addEventListener(W_MEDIA_FIELD_ACTION_EVENT, this.onMediaAction as EventListener);
        this.bound = true;
    }

    unbind(): void {
        this.root.removeEventListener("click", this.onClick);
        this.root.removeEventListener("input", this.onInput);
        this.root.removeEventListener("change", this.onChange);
        this.root.removeEventListener(W_MEDIA_FIELD_ACTION_EVENT, this.onMediaAction as EventListener);
        this.bound = false;
    }

    private onClick = (event: Event): void => {
        const target = event.target as Element | null;
        if (target?.closest("[data-back]")) {
            emitWidgetEvent(this.host, WIDGET_BACK_EVENT, {});
        }
        const action = findActionTarget(event);
        const widget = this.isBound() ? parseJson<DetailWidget>(this.host.dataset.configJson ?? "") : null;
        const data = this.readData();
        if (action?.dataset.confirm && !window.confirm(action.dataset.confirm)) {
            return;
        }
        if (action?.dataset.action) {
            emitWidgetEvent(this.host, WIDGET_ACTION_EVENT, {
                action: action.dataset.action,
                detail: true,
                widget: widget?.id,
                row: data.rowKey,
                resource: this.isBound() ? this.fields.currentResource() : undefined,
                fields: this.fields.currentFields(),
            });
        }
        const chip = target?.closest<HTMLButtonElement>(".chip");
        if (chip) {
            toggleChip(chip, this.emitFieldChange);
        }
        const tableAdd = target?.closest<HTMLButtonElement>("[data-table-add]");
        const tableRemove = target?.closest<HTMLButtonElement>("[data-table-remove]");
        const changedControl = (chip ?? tableAdd ?? tableRemove)?.closest<HTMLElement>("[data-field-control]");
        if (tableAdd) {
            addTableRow(tableAdd, this.fields, this.emitFieldChange);
        }
        if (tableRemove) {
            removeTableRow(tableRemove, this.fields, this.emitFieldChange);
        }
        if (changedControl) {
            this.afterFieldChange(changedControl.dataset.fieldControl ?? "");
        }
    };

    private onInput = (event: Event): void => {
        const control = (event.target as Element | null)?.closest<HTMLElement>("[data-field-control]");
        const field = control ? this.fields.find(control.dataset.fieldControl ?? "") : undefined;
        if (control && field?.input === "table") {
            updateDerivedTables(field.id, this.fields);
        }
        if (field && this.isBound()) {
            this.lookups.schedule(field.id);
            this.schemas.schedule(field.id);
        }
    };

    private onChange = (event: Event): void => {
        const control = (event.target as Element | null)?.closest<HTMLElement>("[data-field-control]");
        if (!control) {
            return;
        }
        this.emitFieldChange(control, Boolean((event as CustomEvent<{ created?: boolean }>).detail?.created));
        updateDerivedTables(control.dataset.fieldControl ?? "", this.fields);
        this.afterFieldChange(control.dataset.fieldControl ?? "");
    };

    private onMediaAction = (event: CustomEvent<DashboardMediaActionDetail>): void => {
        event.stopPropagation();
        const control = (event.target as Element | null)?.closest<HTMLElement>("[data-field-control]");
        const field = control ? this.fields.find(control.dataset.fieldControl ?? "") : undefined;
        if (!field) {
            return;
        }
        emitWidgetEvent(this.host, WIDGET_MEDIA_ACTION_EVENT, {
            ...event.detail,
            rowKey: this.readData().rowKey,
            field: field.id,
        });
    };

    private emitFieldChange = (control: HTMLElement, created = false): void => {
        const field = this.fields.find(control.dataset.fieldControl ?? "");
        if (!field) {
            return;
        }
        const value = readFieldControlValue(field, control);
        this.fields.record(field.id, value);
        emitWidgetEvent(this.host, WIDGET_FIELD_CHANGE_EVENT, {
            rowKey: this.readData().rowKey,
            field: field.id,
            value,
            ...(created ? { created } : {}),
        });
    };

    private afterFieldChange(fieldId: string): void {
        if (this.isBound()) {
            this.lookups.schedule(fieldId);
            this.schemas.schedule(fieldId);
        }
        this.refreshConditionalFields();
    }
}

function findActionTarget(event: Event): HTMLElement | undefined {
    return event
        .composedPath()
        .find((target): target is HTMLElement => target instanceof HTMLElement && Boolean(target.dataset.action));
}
