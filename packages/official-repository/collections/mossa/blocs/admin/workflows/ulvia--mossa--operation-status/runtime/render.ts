import type { Operation } from "./request";

export function renderOperation(root: HTMLElement, value: Operation, copy: (key: string) => string): void {
    const completed = value.status === "succeeded" && value.result?.status === "completed";
    const cancelled = value.status === "succeeded" && value.result?.status === "cancelled";
    const pending = value.status === "queued" || value.status === "running";
    root.setAttribute(
        "data-operation-state",
        cancelled
            ? "cancelled"
            : completed
              ? "completed"
              : value.status === "failed"
                ? "failed"
                : pending
                  ? "pending"
                  : "attention",
    );
    const panel = root.querySelector<HTMLElement>(':scope > [part~="operation-panel"]');
    const status = panel?.querySelector<HTMLOutputElement>('[part~="operation-status"]');
    if (status) {
        const next = copy(
            cancelled
                ? "cancelled"
                : completed
                  ? "succeeded"
                  : value.status === "succeeded"
                    ? "follow-up"
                    : value.status,
        );
        if (status.textContent !== next) {
            status.textContent = next;
        }
    }
    const hint = panel?.querySelector<HTMLElement>('[part~="operation-hint"]');
    if (hint) {
        hint.textContent = copy(
            cancelled
                ? "cancelled-hint"
                : pending
                  ? "pending"
                  : completed
                    ? "completed"
                    : value.status === "failed"
                      ? "failed-hint"
                      : "follow-up-hint",
        );
    }
    const updated = panel?.querySelector<HTMLElement>('[part~="operation-updated"]');
    if (updated) {
        updated.textContent = new Intl.DateTimeFormat(document.documentElement.lang || "en", {
            dateStyle: "medium",
            timeStyle: "medium",
            timeZone: "UTC",
        }).format(new Date(value.updatedAt));
    }
    const phase = panel?.querySelector<HTMLElement>('[part~="operation-phase"]');
    if (phase) {
        phase.textContent = value.result?.status ?? "";
    }
    const error = panel?.querySelector<HTMLElement>('[part~="operation-server-error"]');
    if (error) {
        error.textContent = [value.errorCode, value.errorOutput?.message]
            .filter((item) => typeof item === "string")
            .join(" · ")
            .slice(0, 2300);
    }
}
