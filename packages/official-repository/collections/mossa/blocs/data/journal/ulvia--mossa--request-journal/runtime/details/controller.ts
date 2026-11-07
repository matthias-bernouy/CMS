import type { LogEntry } from "../model";
import { httpLabel } from "../presentation";
import type { Copy, DetailState } from "../presentation";
import { getLogDetail } from "./client";

export class JournalDetails {
    private allowed = new Set<string>();
    private states = new Map<string, DetailState>();
    private pending = new Map<string, AbortController>();
    private queue: string[] = [];
    private generation = 0;
    constructor(
        private readonly root: HTMLElement,
        private readonly copy: Copy,
    ) {
        root.addEventListener("toggle", this.toggle, true);
    }
    readonly lookup = (id: string): DetailState | undefined => this.states.get(id);
    setEntries(entries: readonly LogEntry[]): void {
        this.generation++;
        for (const request of this.pending.values()) {
            request.abort();
        }
        this.pending.clear();
        this.queue = [];
        this.states.clear();
        this.allowed = new Set(entries.slice(0, 50).map((entry) => entry.id));
    }
    disconnect(): void {
        this.setEntries([]);
        this.root.removeEventListener("toggle", this.toggle, true);
    }
    private readonly toggle = (event: Event): void => {
        const target = event.target;
        if (!(target instanceof HTMLDetailsElement) || !target.open || !target.dataset.requestKey) {
            return;
        }
        if (target.dataset.httpId) {
            this.schedule(target.dataset.httpId);
        }
        for (const node of target.querySelectorAll<HTMLElement>("[data-error-entry]")) {
            if (node.dataset.errorEntry) {
                this.schedule(node.dataset.errorEntry);
            }
        }
    };
    private schedule(id: string): void {
        if (
            !this.allowed.has(id) ||
            (this.states.has(id) && this.states.get(id)?.status !== "error") ||
            this.pending.has(id) ||
            this.queue.includes(id)
        ) {
            return;
        }
        this.states.set(id, { status: "loading" });
        this.queue.push(id);
        this.refresh(id);
        this.pump();
    }
    private pump(): void {
        while (this.pending.size < 3 && this.queue.length) {
            const id = this.queue.shift();
            if (id) {
                void this.load(id, this.generation);
            }
        }
    }
    private async load(id: string, generation: number): Promise<void> {
        const request = new AbortController();
        this.pending.set(id, request);
        const timeout = setTimeout(() => request.abort(), 15_000);
        try {
            const data = await getLogDetail(id, request.signal);
            if (generation === this.generation) {
                this.states.set(id, { status: "success", data });
            }
        } catch {
            if (generation === this.generation) {
                this.states.set(id, { status: "error" });
            }
        } finally {
            clearTimeout(timeout);
            if (generation === this.generation) {
                this.pending.delete(id);
                this.refresh(id);
                this.pump();
            }
        }
    }
    private refresh(id: string): void {
        const state = this.states.get(id);
        const label = httpLabel(state?.data);
        for (const node of this.root.querySelectorAll<HTMLElement>("[data-http-label]")) {
            if (node.dataset.httpLabel === id && label) {
                node.textContent = label;
            }
        }
        const status = state?.data?.attributes.status;
        for (const node of this.root.querySelectorAll<HTMLElement>("[data-http-status]")) {
            if (node.dataset.httpStatus === id) {
                node.textContent =
                    state?.status === "loading"
                        ? this.copy("detail-loading")
                        : state?.status === "error"
                          ? this.copy("http-unavailable")
                          : status && /^\d{3}$/.test(status)
                            ? `HTTP ${status}`
                            : "";
            }
        }
        for (const node of this.root.querySelectorAll<HTMLElement>("[data-error-entry]")) {
            if (node.dataset.errorEntry === id) {
                node.textContent =
                    state?.status === "loading"
                        ? this.copy("detail-loading")
                        : state?.status === "error"
                          ? this.copy("detail-unavailable")
                          : state?.data?.error
                            ? `${state.data.error.name}: ${state.data.error.message}`
                            : "";
            }
        }
    }
}
