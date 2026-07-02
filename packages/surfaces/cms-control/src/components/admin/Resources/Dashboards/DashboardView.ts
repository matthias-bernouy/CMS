import { Component } from "@bernouy/components/base";
import { showToast } from "@bernouy/components";
import type { DashboardWidget } from "@bernouy/cms-dashboards";
import css from "./style.css" with { type: "text" };
import template from "./template.html" with { type: "text" };
import {
    currentSelection,
    DASHBOARD_SELECTION_EVENT,
    fetchDashboards,
    fetchDashboardUsers,
    pushSelectionUrl,
    replaceSelectionUrl,
    type DashboardSelection,
    type DashboardUserOption,
} from "./api";
import { renderWidget } from "./domain";
import { renderIcon } from "./icons";
import type { DashboardSourceGroup } from "./types";

type DetailSelection = {
    collection: string;
    row: string;
};

export class DashboardView extends Component {
    private groups: DashboardSourceGroup[] = [];
    private selectedSource = "";
    private selectedDashboard = "";
    private detailSelection: DetailSelection | null = null;
    private userOptions: DashboardUserOption[] | null = null;
    private userOptionsRequest: Promise<DashboardUserOption[]> | null = null;
    private readonly tabState = new Map<string, number>();

    constructor() {
        super({ css: css as unknown as string, template: template as unknown as string });
    }

    override connectedCallback(): void {
        super.connectedCallback();
        this.syncFromSelection(currentSelection());
        this.shadowRoot!.addEventListener("click", this.onClick);
        this.shadowRoot!.addEventListener("change", this.onChange);
        this.shadowRoot!.addEventListener("keydown", this.onKeydown);
        this.shadowRoot!.addEventListener("submit", this.onSubmit);
        window.addEventListener("popstate", this.onPopState);
        window.addEventListener(DASHBOARD_SELECTION_EVENT, this.onSelection as EventListener);
        void this.load();
    }

    disconnectedCallback(): void {
        this.shadowRoot?.removeEventListener("click", this.onClick);
        this.shadowRoot?.removeEventListener("change", this.onChange);
        this.shadowRoot?.removeEventListener("keydown", this.onKeydown);
        this.shadowRoot?.removeEventListener("submit", this.onSubmit);
        window.removeEventListener("popstate", this.onPopState);
        window.removeEventListener(DASHBOARD_SELECTION_EVENT, this.onSelection as EventListener);
    }

    private async load(): Promise<void> {
        try {
            this.groups = await fetchDashboards();
            this.selectedSource ||= this.groups[0]?.source.id ?? "";
            this.ensureDashboardSelection();
        } catch {
            this.groups = [];
        }
        this.render();
    }

    private ensureDashboardSelection(): void {
        const group = this.activeGroup();
        if (!group) {
            this.selectedDashboard = "";
            this.detailSelection = null;
            return;
        }
        if (!group.dashboards.some(dashboard => dashboard.id === this.selectedDashboard)) {
            this.selectedDashboard = group.dashboards[0]?.id ?? "";
            this.detailSelection = null;
        }
    }

    private handleClick(event: Event): void {
        const target = event.target as Element | null;
        const openWrite = target?.closest<HTMLElement>("[data-dashboard-write-open]");
        if (openWrite?.dataset.dashboardWriteOpen) {
            void this.openWriteDialog(openWrite.dataset.dashboardWriteOpen);
            return;
        }
        if (target?.closest("[data-dashboard-write-close]")) {
            this.closeWriteDialog(target);
            return;
        }
        if (target?.closest("[data-dashboard-back]")) {
            this.clearDetailSelection();
            return;
        }
        if (this.selectRow(target)) return;

        const tabButton = target?.closest<HTMLElement>("[data-tab-key]");
        if (tabButton?.dataset.tabKey && tabButton.dataset.tabIndex) {
            this.tabState.set(tabButton.dataset.tabKey, Number(tabButton.dataset.tabIndex));
            this.renderWidgets();
        }
    }

    private handleKeydown(event: KeyboardEvent): void {
        if (event.key !== "Enter" && event.key !== " ") return;
        if (!this.selectRow(event.target as Element | null)) return;
        event.preventDefault();
    }

    private handleChange(event: Event): void {
        const target = event.target;
        if (target instanceof HTMLInputElement && target.type === "file" && target.dataset.dashboardFieldType === "file") {
            syncFileInputLabel(target);
        }
    }

    private selectRow(target: Element | null): boolean {
        const row = target?.closest<HTMLElement>("[data-dashboard-collection][data-dashboard-row-key]");
        const collection = row?.dataset.dashboardCollection;
        const rowKey = row?.dataset.dashboardRowKey;
        if (!collection || !rowKey?.trim()) return false;
        this.detailSelection = { collection, row: rowKey };
        pushSelectionUrl(this.selection());
        this.renderDetail();
        return true;
    }

    private clearDetailSelection(): void {
        if (!this.detailSelection) return;
        this.detailSelection = null;
        replaceSelectionUrl(this.selection());
        this.renderDetail();
    }

    private render(): void {
        this.renderDetail();
    }

    private renderDetail(): void {
        const group = this.activeGroup();
        const dashboard = this.activeDashboard();
        this.query<HTMLElement>("[data-empty]").hidden = Boolean(group);
        this.query<HTMLElement>("[data-source-empty]").hidden = !group || Boolean(dashboard);
        this.query<HTMLElement>("[data-dashboard-head]").hidden = !dashboard;
        this.query<HTMLElement>("[data-detail-toolbar]").hidden = !dashboard || !this.detailSelection;
        this.query<HTMLElement>("[data-widgets]").hidden = !dashboard;
        if (!group) return;

        if (!dashboard) return;
        this.text("[data-dashboard-name]", dashboard.meta?.name ?? dashboard.id);
        renderIcon(this.query<HTMLElement>("[data-dashboard-icon]"), dashboard.meta?.svg, dashboard.meta?.icon, "layout");
        this.text("[data-detail-row]", this.detailSelection?.row ?? "");
        this.renderWidgets();
    }

    private renderWidgets(): void {
        const group = this.activeGroup();
        const dashboard = this.activeDashboard();
        const root = this.query<HTMLElement>("[data-widgets]");
        if (!group || !dashboard) {
            root.replaceChildren();
            return;
        }
        const detail = this.detailSelection;
        const widgets = detail ? detailWidgetsFor(dashboard.views, detail.collection) : mainWidgetsFor(dashboard.views);
        const selectedRows = new Map<string, string>();
        if (detail) selectedRows.set(detail.collection, detail.row);

        if (detail && !widgets.length) {
            root.innerHTML = `
                <section class="panel empty">
                    <strong>No detail view</strong>
                    <span>This dashboard does not declare a detail widget for this collection.</span>
                </section>
            `;
            return;
        }

        root.innerHTML = widgets
            .map((widget, index) => renderWidget(widget, { group, dashboard, selectedRows }, `root.${index}`, this.tabState))
            .join("");
        void this.hydrateUserPickers();
    }

    private async handleSubmit(event: SubmitEvent): Promise<void> {
        const target = event.target;
        if (!(target instanceof HTMLFormElement) || !target.matches("[data-dashboard-write]")) return;
        event.preventDefault();

        const form = target;
        const state = form.querySelector<HTMLElement>("[data-dashboard-write-state]");
        setWriteState(state, "");
        form.setAttribute("aria-busy", "true");
        setWriteState(state, "Saving...");
        try {
            const payload = await readWritePayload(form);
            if (!payload.ok) {
                setWriteState(state, payload.message, "error");
                showToast(payload.message, { type: "error" });
                payload.control?.focus();
                return;
            }

            let url: string;
            try {
                url = resolveWriteUrl(form.dataset.dashboardUrl ?? "", payload.params);
            } catch (error) {
                const message = error instanceof Error ? error.message : "Invalid write URL";
                setWriteState(state, message, "error");
                showToast(message, { type: "error" });
                return;
            }

            const method = form.dataset.dashboardMethod || "POST";
            const response = await fetch(url, {
                method,
                headers: {
                    accept: "application/json",
                    "content-type": "application/json",
                },
                body: JSON.stringify(payload.body),
            });
            if (!response.ok) {
                const message = await responseMessage(response);
                setWriteState(state, message, "error");
                showToast(message, { type: "error" });
                return;
            }

            form.reset();
            const successMessage = form.dataset.dashboardSuccessMessage || "Saved";
            setWriteState(state, `${successMessage}.`, "success");
            showToast(successMessage, { type: "success" });
            this.renderWidgets();
        } catch {
            setWriteState(state, "Network error", "error");
            showToast("Network error", { type: "error" });
        } finally {
            form.removeAttribute("aria-busy");
        }
    }

    private async openWriteDialog(id: string): Promise<void> {
        const dialog = this.shadowRoot!.querySelector<HTMLDialogElement>(`[data-dashboard-write-dialog="${cssEscape(id)}"]`);
        if (!dialog) return;
        const form = dialog.querySelector<HTMLFormElement>("[data-dashboard-write]");
        if (typeof dialog.showModal === "function") dialog.showModal();
        else dialog.setAttribute("open", "");
        void this.hydrateUserPickers(dialog);
        if (form?.dataset.dashboardLoadUrl) {
            await this.hydrateWriteForm(form);
            void this.hydrateUserPickers(dialog);
        }
    }

    private closeWriteDialog(target: Element | null): void {
        const dialog = target?.closest<HTMLDialogElement>("dialog[data-dashboard-write-dialog]");
        if (!dialog) return;
        dialog.close();
    }

    private async hydrateWriteForm(form: HTMLFormElement): Promise<void> {
        const state = form.querySelector<HTMLElement>("[data-dashboard-write-state]");
        setWriteState(state, "Loading...");
        try {
            const response = await fetch(form.dataset.dashboardLoadUrl ?? "", { headers: { accept: "application/json" } });
            if (!response.ok) {
                const message = await responseMessage(response);
                setWriteState(state, message, "error");
                showToast(message, { type: "error" });
                return;
            }
            const item = await response.json() as Record<string, unknown>;
            fillWriteForm(form, item);
            setWriteState(state, "");
        } catch {
            setWriteState(state, "Unable to load item", "error");
            showToast("Unable to load item", { type: "error" });
        }
    }

    private async hydrateUserPickers(root: ParentNode = this.shadowRoot!): Promise<void> {
        const pickers = Array.from(root.querySelectorAll<HTMLElement>("[data-dashboard-user-picker]"));
        if (!pickers.length) return;
        try {
            const users = await this.loadUserOptions();
            for (const picker of pickers) hydrateUserPicker(picker, users);
        } catch {
            for (const picker of pickers) {
                const input = picker.querySelector<HTMLInputElement>("[data-dashboard-user-search]");
                if (input) input.placeholder = "Unable to load users";
            }
        }
    }

    private loadUserOptions(): Promise<DashboardUserOption[]> {
        if (this.userOptions) return Promise.resolve(this.userOptions);
        this.userOptionsRequest ??= fetchDashboardUsers().then(users => {
            this.userOptions = users;
            return users;
        });
        return this.userOptionsRequest;
    }

    private activeGroup(): DashboardSourceGroup | null {
        return this.groups.find(group => group.source.id === this.selectedSource) ?? null;
    }

    private activeDashboard() {
        return this.activeGroup()?.dashboards.find(dashboard => dashboard.id === this.selectedDashboard) ?? null;
    }

    private selection(): DashboardSelection {
        return {
            source: this.selectedSource,
            dashboard: this.selectedDashboard,
            ...(this.detailSelection ? {
                collection: this.detailSelection.collection,
                row: this.detailSelection.row,
            } : {}),
        };
    }

    private syncFromSelection(selection: DashboardSelection): void {
        this.selectedSource = selection.source;
        this.selectedDashboard = selection.dashboard;
        this.detailSelection = selection.collection && selection.row
            ? { collection: selection.collection, row: selection.row }
            : null;
    }

    private text(selector: string, value: string): void {
        this.query<HTMLElement>(selector).textContent = value;
    }

    private onSelection = (event: CustomEvent<DashboardSelection>): void => {
        this.syncFromSelection(event.detail);
        this.ensureDashboardSelection();
        this.renderDetail();
    };

    private readonly onPopState = (): void => {
        this.syncFromSelection(currentSelection());
        this.ensureDashboardSelection();
        this.renderDetail();
    };

    private readonly onClick = (event: Event): void => {
        this.handleClick(event);
    };

    private readonly onChange = (event: Event): void => {
        this.handleChange(event);
    };

    private readonly onKeydown = (event: Event): void => {
        this.handleKeydown(event as KeyboardEvent);
    };

    private readonly onSubmit = (event: Event): void => {
        void this.handleSubmit(event as SubmitEvent);
    };

    private query<T extends Element>(selector: string): T {
        return this.shadowRoot!.querySelector(selector) as T;
    }
}

type WritePayload =
    | { ok: true; body: Record<string, unknown>; params: URLSearchParams }
    | { ok: false; message: string; control?: HTMLElement };

type PendingFileUpload = {
    control: HTMLElement;
    field: string;
    file: File;
    method: string;
    url: string;
    resultPath: string;
};

async function readWritePayload(form: HTMLFormElement): Promise<WritePayload> {
    const body: Record<string, unknown> = {};
    const params = new URLSearchParams();
    const controls = Array.from(form.querySelectorAll<HTMLElement>("[data-dashboard-field]"));
    const uploads: PendingFileUpload[] = [];

    for (const control of controls) {
        if (control.hasAttribute("data-dashboard-readonly")) continue;
        const name = control.getAttribute("name") ?? "";
        if (!name) continue;
        if (control.dataset.dashboardFieldType === "file") {
            const pending = readFileUpload(control, name);
            if (!pending.ok) return pending;
            if (pending.upload) uploads.push(pending.upload);
            continue;
        }
        const value = readFieldValue(control);
        const required = control.hasAttribute("required");
        if (required && isEmptyFieldValue(value)) {
            return { ok: false, message: `${fieldLabel(control, name)} is required`, control };
        }
        if (control.dataset.dashboardFieldType === "number" && typeof value === "string" && value) {
            return { ok: false, message: `${fieldLabel(control, name)} must be a number`, control };
        }
        if (isEmptyFieldValue(value)) continue;
        if (control.hasAttribute("data-dashboard-param")) {
            params.set(name, String(value));
        } else {
            setNestedValue(body, name, value);
        }
    }

    for (const upload of uploads) {
        const result = await uploadFile(upload, params);
        if (!result.ok) return { ok: false, message: result.message, control: upload.control };
        setNestedValue(body, upload.field, result.value);
    }

    return { ok: true, body, params };
}

function readFileUpload(control: HTMLElement, name: string): { ok: true; upload?: PendingFileUpload } | { ok: false; message: string; control?: HTMLElement } {
    const input = control instanceof HTMLInputElement && control.type === "file" ? control : null;
    const file = input?.files?.[0];
    const required = control.hasAttribute("required");
    if (!file) {
        if (required && !control.dataset.existingValue) {
            return { ok: false, message: `${fieldLabel(control, name)} is required`, control };
        }
        return { ok: true };
    }
    const url = control.dataset.dashboardUploadUrl;
    const resultPath = control.dataset.dashboardUploadResultPath;
    if (!url || !resultPath) {
        return { ok: false, message: `${fieldLabel(control, name)} has no upload endpoint`, control };
    }
    return {
        ok: true,
        upload: {
            control,
            field: name,
            file,
            method: control.dataset.dashboardUploadMethod || "POST",
            url,
            resultPath,
        },
    };
}

async function uploadFile(upload: PendingFileUpload, params: URLSearchParams): Promise<{ ok: true; value: unknown } | { ok: false; message: string }> {
    let url: string;
    try {
        url = resolveWriteUrl(upload.url, params);
    } catch (error) {
        return { ok: false, message: error instanceof Error ? error.message : "Invalid upload URL" };
    }
    const body = new FormData();
    body.append("file", upload.file, upload.file.name);
    const response = await fetch(url, {
        method: upload.method,
        headers: { accept: "application/json" },
        body,
    });
    if (!response.ok) return { ok: false, message: await responseMessage(response) };
    let data: unknown;
    try {
        data = await response.json();
    } catch {
        return { ok: false, message: "Upload did not return JSON" };
    }
    const value = valueAtPathUnknown(data, upload.resultPath);
    if (value === undefined) return { ok: false, message: `Upload response is missing ${upload.resultPath}` };
    return { ok: true, value };
}

function readFieldValue(control: HTMLElement): unknown {
    const type = control.dataset.dashboardFieldType ?? "text";
    if (type === "cms-user") return control.dataset.value ?? "";
    if (control instanceof HTMLInputElement && control.type === "checkbox") return control.checked;

    const valueControl = control as HTMLElement & { value?: unknown };
    const raw = typeof valueControl.value === "string"
        ? valueControl.value.trim()
        : "";
    if (type === "number") {
        if (!raw) return "";
        const value = Number(raw);
        return Number.isFinite(value) ? value : raw;
    }
    return raw;
}

function isEmptyFieldValue(value: unknown): boolean {
    return value === "" || value === null || value === undefined;
}

function fieldLabel(control: HTMLElement, name: string): string {
    return control.dataset.dashboardFieldLabel ?? control.getAttribute("label") ?? name;
}

function setNestedValue(target: Record<string, unknown>, path: string, value: unknown): void {
    const parts = path.split(".").filter(Boolean);
    let current = target;
    for (const part of parts.slice(0, -1)) {
        const existing = current[part];
        if (!existing || typeof existing !== "object" || Array.isArray(existing)) {
            current[part] = {};
        }
        current = current[part] as Record<string, unknown>;
    }
    const leaf = parts.at(-1);
    if (leaf) current[leaf] = value;
}

function resolveWriteUrl(template: string, params: URLSearchParams): string {
    return template.replace(/#\{([^}]+)\}/g, (_match, rawName: string) => {
        const name = rawName.trim();
        const value = params.get(name);
        if (value === null) throw new Error(`${name} is required`);
        return encodeURIComponent(value);
    });
}

function setWriteState(target: HTMLElement | null, message: string, kind = ""): void {
    if (!target) return;
    target.textContent = message;
    target.hidden = !message;
    target.dataset.state = kind;
}

function fillWriteForm(form: HTMLFormElement, item: Record<string, unknown>): void {
    const controls = Array.from(form.querySelectorAll<HTMLElement>("[data-dashboard-field]"));
    for (const control of controls) {
        const name = control.getAttribute("name") ?? "";
        if (!name) continue;
        setFieldValue(control, valueAtPath(item, name));
    }
}

function setFieldValue(control: HTMLElement, value: unknown): void {
    const type = control.dataset.dashboardFieldType ?? "text";
    if (type === "cms-user") {
        if (typeof value === "string" && value) control.dataset.value = value;
        else delete control.dataset.value;
        const input = control.querySelector<HTMLInputElement>("[data-dashboard-user-search]");
        if (input) input.value = typeof value === "string" ? value : "";
        return;
    }
    if (control instanceof HTMLInputElement && control.type === "file") {
        if (typeof value === "string" && value) control.dataset.existingValue = value;
        else delete control.dataset.existingValue;
        syncFileInputLabel(control);
        return;
    }
    if (control instanceof HTMLInputElement && control.type === "checkbox") {
        control.checked = value === true;
        return;
    }
    const valueControl = control as HTMLElement & { value?: unknown };
    const stringValue = value === null || value === undefined ? "" : String(value);
    if ("value" in valueControl) valueControl.value = stringValue;
    control.setAttribute("value", stringValue);
}

function syncFileInputLabel(input: HTMLInputElement): void {
    const label = input.closest(".dashboard-file-field")?.querySelector<HTMLElement>("[data-dashboard-file-name]");
    if (!label) return;
    const file = input.files?.[0];
    label.textContent = file?.name || (input.dataset.existingValue ? "Current file kept" : "No file selected");
}

function valueAtPath(item: Record<string, unknown>, path: string): unknown {
    return valueAtPathUnknown(item, path);
}

function valueAtPathUnknown(value: unknown, path: string): unknown {
    let current: unknown = value;
    for (const part of path.split(".")) {
        if (!part || !current || typeof current !== "object" || Array.isArray(current)) return undefined;
        current = (current as Record<string, unknown>)[part];
    }
    return current;
}

async function responseMessage(response: Response): Promise<string> {
    const text = await response.text().catch(() => "");
    if (!text) return `HTTP ${response.status}`;
    try {
        const data = JSON.parse(text) as { error?: unknown; message?: unknown };
        if (typeof data.error === "string") return data.error;
        if (typeof data.message === "string") return data.message;
    } catch {
        // Plain text responses are valid source proxy errors.
    }
    return text;
}

function hydrateUserPicker(picker: HTMLElement, users: DashboardUserOption[]): void {
    const input = picker.querySelector<HTMLInputElement>("[data-dashboard-user-search]");
    const menu = picker.querySelector<HTMLElement>("[data-dashboard-user-menu]");
    if (!input || !menu) return;

    const syncInitialSelection = () => {
        const selected = picker.dataset.value;
        if (!selected) return;
        const user = users.find(candidate => candidate.sub === selected);
        input.value = user ? userLabel(user) : selected;
    };

    if (picker.dataset.dashboardUserHydrated === "true") {
        syncInitialSelection();
        return;
    }
    picker.dataset.dashboardUserHydrated = "true";

    let activeIndex = -1;

    const render = () => {
        const options = matchingUsers(users, input.value);
        if (activeIndex >= options.length) activeIndex = options.length - 1;
        renderUserMenu(menu, options, activeIndex);
        menu.hidden = false;
        input.setAttribute("aria-expanded", "true");
        menu.querySelector(".active")?.scrollIntoView({ block: "nearest" });
    };
    const close = () => {
        menu.hidden = true;
        input.setAttribute("aria-expanded", "false");
        activeIndex = -1;
    };
    const select = (user: DashboardUserOption) => {
        picker.dataset.value = user.sub;
        input.value = userLabel(user);
        close();
    };
    const syncExactSelection = () => {
        const value = input.value.trim();
        const user = users.find(candidate => userMatchesInput(candidate, value));
        if (user) select(user);
        else delete picker.dataset.value;
    };

    input.addEventListener("focus", render);
    input.addEventListener("input", () => {
        delete picker.dataset.value;
        activeIndex = 0;
        render();
    });
    input.addEventListener("change", syncExactSelection);
    input.addEventListener("blur", () => {
        syncExactSelection();
        window.setTimeout(close, 120);
    });
    input.addEventListener("keydown", (event) => {
        const options = matchingUsers(users, input.value);
        if (event.key === "ArrowDown") {
            activeIndex = Math.min(activeIndex + 1, Math.max(options.length - 1, 0));
            render();
            event.preventDefault();
            return;
        }
        if (event.key === "ArrowUp") {
            activeIndex = Math.max(activeIndex - 1, 0);
            render();
            event.preventDefault();
            return;
        }
        if (event.key === "Enter" && activeIndex >= 0 && options[activeIndex]) {
            select(options[activeIndex]!);
            event.preventDefault();
            return;
        }
        if (event.key === "Escape") {
            close();
            event.preventDefault();
        }
    });
    menu.addEventListener("mousedown", event => event.preventDefault());
    menu.addEventListener("click", (event) => {
        const option = (event.target as Element | null)?.closest<HTMLElement>("[data-dashboard-user-value]");
        const user = users.find(candidate => candidate.sub === option?.dataset.dashboardUserValue);
        if (user) select(user);
    });
    syncInitialSelection();
}

function userMatchesInput(user: DashboardUserOption, value: string): boolean {
    if (!value) return false;
    return [userLabel(user), user.email, user.displayName, user.sub]
        .filter((entry): entry is string => typeof entry === "string" && Boolean(entry))
        .some(entry => entry.trim().toLowerCase() === value.toLowerCase());
}

function matchingUsers(users: DashboardUserOption[], query: string): DashboardUserOption[] {
    const normalized = query.trim().toLowerCase();
    const matches = normalized
        ? users.filter(user => userSearchText(user).includes(normalized))
        : users;
    return matches.slice(0, 20);
}

function renderUserMenu(menu: HTMLElement, users: DashboardUserOption[], activeIndex: number): void {
    menu.replaceChildren();
    if (!users.length) {
        const empty = document.createElement("div");
        empty.className = "dashboard-user-empty";
        empty.textContent = "No users found";
        menu.append(empty);
        return;
    }
    users.forEach((user, index) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = `dashboard-user-option${index === activeIndex ? " active" : ""}`;
        button.dataset.dashboardUserValue = user.sub;
        button.setAttribute("role", "option");
        button.setAttribute("aria-selected", index === activeIndex ? "true" : "false");

        const title = document.createElement("span");
        title.textContent = user.displayName || user.email || user.sub;
        const meta = document.createElement("small");
        meta.textContent = user.email && user.email !== title.textContent ? user.email : user.sub;
        button.append(title, meta);
        menu.append(button);
    });
}

function userLabel(user: DashboardUserOption): string {
    const name = user.displayName || user.email || user.sub;
    const suffix = user.email && user.email !== name ? ` · ${user.email}` : "";
    return `${name}${suffix}`;
}

function userSearchText(user: DashboardUserOption): string {
    return [user.displayName, user.email, user.sub, userLabel(user)]
        .filter((entry): entry is string => typeof entry === "string" && Boolean(entry))
        .join(" ")
        .toLowerCase();
}

function cssEscape(value: string): string {
    return value.replace(/\\/g, "\\\\").replace(/"/g, "\\\"");
}

function mainWidgetsFor(widgets: DashboardWidget[]): DashboardWidget[] {
    const result: DashboardWidget[] = [];
    for (const widget of widgets) {
        if (widget.widget === "w-detail" || widget.widget === "w-update") continue;
        if (widget.widget === "w-section") {
            const children = mainWidgetsFor(widget.children);
            if (children.length) result.push({ ...widget, children });
            continue;
        }
        if (widget.widget === "w-tabs") {
            const tabs = widget.tabs
                .map(tab => ({ label: tab.label, children: mainWidgetsFor(tab.children) }))
                .filter(tab => tab.children.length);
            if (tabs.length) result.push({ ...widget, tabs });
            continue;
        }
        result.push(widget);
    }
    return result;
}

function detailWidgetsFor(widgets: DashboardWidget[], collection: string): DashboardWidget[] {
    const result: DashboardWidget[] = [];
    for (const widget of widgets) {
        if ((widget.widget === "w-detail" || widget.widget === "w-update") && widget.collection === collection) {
            result.push(widget);
            continue;
        }
        if (widget.widget === "w-section") {
            const children = detailWidgetsFor(widget.children, collection);
            if (children.length) result.push({ ...widget, children });
            continue;
        }
        if (widget.widget === "w-tabs") {
            const tabs = widget.tabs
                .map(tab => ({ label: tab.label, children: detailWidgetsFor(tab.children, collection) }))
                .filter(tab => tab.children.length);
            if (tabs.length) result.push({ ...widget, tabs });
        }
    }
    return result;
}

if (!customElements.get("cms-dashboards-admin")) customElements.define("cms-dashboards-admin", DashboardView);
