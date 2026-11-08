import { queryLogs } from "./runtime/model";
import type { LogEntry, LogPage } from "./runtime/model";
import { renderJournal } from "./runtime/render";
import { JournalDetails } from "./runtime/details/controller";

const prefix = "ulvia--mossa--log-";
const fields = { service: "service", event: "eventPrefix", request: "requestId", level: "minLevel" } as const;

export function mount(root: HTMLElement): () => void {
    const form = root.querySelector<HTMLElement>('[part="filters"]');
    const range = root.querySelector<HTMLElement>('[cms-bloc="ulvia--mossa--date-range"]');
    const status = root.querySelector<HTMLElement>("[data-status]");
    const alert = root.querySelector<HTMLElement>("[data-error]");
    const next = root.querySelector<HTMLButtonElement>("[data-next]");
    const grouped = root.querySelector<HTMLInputElement>("[data-grouped]");
    if (!form || !range || !status || !alert || !next || !grouped) {
        return () => {};
    }
    let entries: LogEntry[] = [];
    let page: LogPage | null = null;
    let request: AbortController | null = null;
    let disconnected = false;
    let activeInput: Record<string, unknown> = {};
    const copy = (key: string): string => root.querySelector(`[data-copy="${key}"]`)?.textContent?.trim() ?? "";
    const details = new JournalDetails(root, copy);
    const params = new URLSearchParams(window.location.search);
    for (const [field] of Object.entries(fields)) {
        const input = form.querySelector(`[name="${field}"]`) as HTMLInputElement | null;
        if (input) {
            input.value = params.get(prefix + field) ?? "";
        }
    }
    grouped.checked = params.get(prefix + "group") !== "false";
    const now = Date.now();
    range.setAttribute("from", params.get(prefix + "from") || new Date(now - 900_000).toISOString());
    range.setAttribute("to", params.get(prefix + "to") || new Date(now).toISOString());

    const readFilters = (): Record<string, unknown> => {
        const input: Record<string, unknown> = {};
        for (const [field, key] of Object.entries(fields)) {
            const value = (form.querySelector(`[name="${field}"]`) as HTMLInputElement | null)?.value.trim();
            if (value) {
                input[key] = value;
            }
        }
        input.from = range.getAttribute("from");
        input.to = range.getAttribute("to");
        return input;
    };
    const updateUrl = (): void => {
        const url = new URL(window.location.href);
        for (const [field, key] of Object.entries(fields)) {
            url.searchParams.delete(prefix + field);
            if (activeInput[key]) {
                url.searchParams.set(prefix + field, String(activeInput[key]));
            }
        }
        for (const field of ["from", "to"]) {
            url.searchParams.set(prefix + field, String(activeInput[field]));
        }
        url.searchParams.set(prefix + "group", String(grouped.checked));
        url.searchParams.delete(prefix + "cursor");
        window.history.replaceState(window.history.state, "", url);
    };
    const render = (): void => renderJournal(root, entries, grouped.checked, copy, details.lookup);
    const load = async (cursor?: string): Promise<void> => {
        request?.abort();
        const current = new AbortController();
        request = current;
        const timeout = setTimeout(() => current.abort(), 30_000);
        if (!cursor) {
            details.setEntries([]);
            activeInput = readFilters();
            entries = [];
            page = null;
            render();
        }
        root.setAttribute("aria-busy", "true");
        status.textContent = copy("loading");
        alert.hidden = true;
        next.disabled = true;
        try {
            const response = await queryLogs({ ...activeInput, ...(cursor ? { cursor } : {}) }, current.signal);
            if (disconnected || request !== current) {
                return;
            }
            page = response;
            entries = response.items;
            details.setEntries(entries);
            render();
            status.textContent = "";
            next.hidden = !response.nextCursor;
            updateUrl();
        } catch {
            if (!disconnected && request === current) {
                alert.hidden = false;
                status.textContent = "";
                if (!cursor) {
                    next.hidden = true;
                }
            }
        } finally {
            clearTimeout(timeout);
            if (!disconnected && request === current) {
                root.removeAttribute("aria-busy");
                next.disabled = false;
            }
        }
    };
    const submit = (event: KeyboardEvent): void => {
        if (event.key === "Enter" && event.target instanceof HTMLInputElement && event.target.name) {
            event.preventDefault();
            void load();
        }
    };
    const click = (event: Event): void => {
        const target = (event.target as Element).closest("button");
        if (target?.hasAttribute("data-search")) {
            void load();
        } else if (target?.hasAttribute("data-next") && page?.nextCursor) {
            void load(page.nextCursor);
        } else if (target?.hasAttribute("data-reset")) {
            for (const [field] of Object.entries(fields)) {
                const input = form.querySelector(`[name="${field}"]`) as HTMLInputElement | null;
                if (input) {
                    input.value = "";
                }
            }
            const end = Date.now();
            range.setAttribute("from", new Date(end - 900_000).toISOString());
            range.setAttribute("to", new Date(end).toISOString());
            void load();
        }
    };
    const change = (): void => {
        render();
        if (Object.keys(activeInput).length) {
            updateUrl();
        }
    };
    form.addEventListener("keydown", submit);
    root.addEventListener("click", click);
    grouped.addEventListener("change", change);
    void load();
    return () => {
        disconnected = true;
        request?.abort();
        details.disconnect();
        form.removeEventListener("keydown", submit);
        root.removeEventListener("click", click);
        grouped.removeEventListener("change", change);
    };
}
