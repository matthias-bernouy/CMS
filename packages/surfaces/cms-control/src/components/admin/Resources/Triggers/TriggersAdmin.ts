import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };
import { fetchTriggers, setTriggerEnabled, type TriggerListItem } from "./api";

export class TriggersAdmin extends HTMLElement {
    private initialized = false;
    private rows: HTMLElement | null = null;

    connectedCallback(): void {
        if (!this.initialized) {
            this.mount();
            this.initialized = true;
        }
        void this.reload();
    }

    private mount(): void {
        const style = document.createElement("style");
        style.textContent = css as unknown as string;
        const body = document.createElement("template");
        body.innerHTML = template as unknown as string;
        this.replaceChildren(style, body.content.cloneNode(true));
        this.rows = this.querySelector("[data-role='rows']");
    }

    private async reload(): Promise<void> {
        this.show("loading");
        try {
            const triggers = await fetchTriggers();
            this.renderRows(triggers);
            this.show(triggers.length ? "list" : "empty");
        } catch {
            this.show("error");
        }
    }

    private renderRows(triggers: TriggerListItem[]): void {
        this.rows?.replaceChildren(...triggers.map(trigger => this.row(trigger)));
    }

    private row(trigger: TriggerListItem): HTMLTableRowElement {
        const row = document.createElement("tr");
        const enabled = document.createElement("input");
        enabled.type = "checkbox";
        enabled.checked = trigger.enabled;
        enabled.setAttribute("aria-label", `Enable ${trigger.label ?? trigger.id}`);
        enabled.addEventListener("change", () => void this.toggle(trigger.id, enabled));

        row.append(
            cell(enabled),
            cell(textBlock(trigger.label ?? trigger.id, trigger.id)),
            cell(`${trigger.event.phase} ${trigger.event.source ?? "*"}.${trigger.event.endpoint ?? "*"}`),
            cell(trigger.function.id),
            cell(trigger.mode ?? "async"),
            cell(lastRun(trigger)),
        );
        return row;
    }

    private async toggle(id: string, input: HTMLInputElement): Promise<void> {
        input.disabled = true;
        try {
            await setTriggerEnabled(id, input.checked);
        } catch {
            input.checked = !input.checked;
        } finally {
            input.disabled = false;
        }
    }

    private show(state: "loading" | "error" | "empty" | "list"): void {
        for (const el of Array.from(this.querySelectorAll<HTMLElement>("[data-state]"))) {
            el.hidden = el.dataset.state !== state;
        }
    }
}

if (!customElements.get("cms-triggers-admin")) customElements.define("cms-triggers-admin", TriggersAdmin);

function cell(content: Node | string): HTMLTableCellElement {
    const td = document.createElement("td");
    if (typeof content === "string") td.textContent = content;
    else td.append(content);
    return td;
}

function textBlock(primary: string, secondary: string): HTMLElement {
    const wrap = document.createElement("div");
    const top = document.createElement("div");
    const bottom = document.createElement("div");
    top.className = "primary";
    bottom.className = "muted";
    top.textContent = primary;
    bottom.textContent = secondary;
    wrap.append(top, bottom);
    return wrap;
}

function lastRun(trigger: TriggerListItem): HTMLElement {
    const badge = document.createElement("span");
    badge.className = `status ${trigger.lastRun?.status ?? ""}`.trim();
    badge.textContent = trigger.lastRun
        ? `${trigger.lastRun.status} - ${formatDate(trigger.lastRun.at)}`
        : "Never";
    if (trigger.lastRun?.error) badge.title = trigger.lastRun.error;
    return badge;
}

function formatDate(value: string): string {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(date);
}
