type Choice = HTMLElement & { getAttribute(name: string): string | null };
type Toggle = HTMLElement & { checked: boolean };

/** Unsaved checkbox edits only. Saved values and HTTP state belong to binding. */
export class AvailabilityDrafts {
    private readonly changes = new Map<string, Map<string, boolean>>();

    get dirty(): boolean {
        return [...this.changes.values()].some((changes) => changes.size > 0);
    }

    change(choice: Choice): void {
        const id = this.installation(choice);
        const resource = choice.getAttribute("resource");
        const toggle = choice.querySelector<Toggle>("w13c-switch");
        if (!id || !resource || !toggle) {
            return;
        }
        const changes = this.changes.get(id) ?? new Map<string, boolean>();
        if (toggle.checked === (choice.getAttribute("selected") === "true")) {
            changes.delete(resource);
        } else {
            changes.set(resource, toggle.checked);
        }
        this.changes.set(id, changes);
    }

    sync(root: HTMLElement): void {
        for (const choice of Array.from(root.querySelectorAll<Choice>("cms-bloc-choice"))) {
            const toggle = choice.querySelector<Toggle>("w13c-switch");
            if (toggle) {
                toggle.checked =
                    this.changes.get(this.installation(choice))?.get(choice.getAttribute("resource") ?? "") ??
                    choice.getAttribute("selected") === "true";
            }
        }
        for (const section of Array.from(root.querySelectorAll<HTMLElement>("[data-installation]"))) {
            const count = this.changes.get(section.dataset.installation ?? "")?.size ?? 0;
            const bar = section.querySelector<HTMLElement>("[data-save-bar]");
            if (bar) {
                bar.hidden = count === 0;
            }
            const note = section.querySelector<HTMLElement>("[data-draft-count]");
            if (note) {
                note.textContent = `${count} unsaved ${count === 1 ? "change" : "changes"}`;
            }
        }
    }

    prepare(form: HTMLFormElement): void {
        const selected = new Set(
            Array.from(form.querySelectorAll<HTMLInputElement>("[data-saved-resource]"), (input) => input.value),
        );
        for (const [resource, active] of this.changes.get(this.installation(form)) ?? []) {
            if (active) {
                selected.add(resource);
            } else {
                selected.delete(resource);
            }
        }
        const fields = Array.from(selected, (resource) => {
            const input = form.ownerDocument.createElement("input");
            input.type = "hidden";
            input.name = "resources[]";
            input.value = resource;
            return input;
        });
        form.querySelector("[data-selected-fields]")?.replaceChildren(...fields);
    }

    clear(element: Element): void {
        this.changes.delete(this.installation(element));
    }

    private installation(element: Element): string {
        return element.closest<HTMLElement>("[data-installation]")?.dataset.installation ?? "";
    }
}
