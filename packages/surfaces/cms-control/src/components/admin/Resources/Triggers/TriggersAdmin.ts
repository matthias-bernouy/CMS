import template from "./template.html" with { type: "text" };
import css from "./style.css" with { type: "text" };
import { fetchTriggers, runScheduledTrigger, setTriggerEnabled, type TriggerListItem } from "./api";
import { cell, eventLabel, lastRun, runtimeState, textBlock } from "./presentation";

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
        this.rows?.replaceChildren(...triggers.map((trigger) => this.row(trigger)));
    }

    private row(trigger: TriggerListItem): HTMLTableRowElement {
        const row = document.createElement("tr");
        const enabled = document.createElement("input");
        enabled.type = "checkbox";
        enabled.checked = trigger.enabled;
        enabled.setAttribute("aria-label", `Enable ${trigger.label ?? trigger.id}`);
        enabled.addEventListener("change", () => void this.toggle(trigger, enabled));

        row.append(
            cell(enabled),
            cell(
                textBlock(
                    trigger.label ?? trigger.id,
                    [trigger.id, trigger.integration?.label].filter(Boolean).join(" · "),
                ),
            ),
            cell(eventLabel(trigger)),
            cell(trigger.function?.id ?? trigger.task?.id ?? "Unknown"),
            cell(runtimeState(trigger)),
            cell(lastRun(trigger)),
            cell(trigger.event.kind === "schedule" ? this.runButton(trigger) : ""),
        );
        return row;
    }

    private runButton(trigger: TriggerListItem): HTMLButtonElement {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "run";
        button.textContent = "Run now";
        button.disabled = !trigger.enabled || !trigger.schedulerAvailable || !!trigger.scheduleState?.running;
        button.addEventListener("click", async () => {
            button.disabled = true;
            try {
                await runScheduledTrigger(trigger.id);
            } finally {
                await this.reload();
            }
        });
        return button;
    }

    private async toggle(trigger: TriggerListItem, input: HTMLInputElement): Promise<void> {
        if (
            !input.checked &&
            trigger.critical &&
            !window.confirm(`Disable critical trigger "${trigger.label ?? trigger.id}"?`)
        ) {
            input.checked = true;
            return;
        }
        input.disabled = true;
        try {
            await setTriggerEnabled(trigger.id, input.checked);
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

if (!customElements.get("cms-triggers-admin")) {
    customElements.define("cms-triggers-admin", TriggersAdmin);
}
