import { setState } from "@bernouy/components/binding";

export class CmsDashboardMemberFilter extends HTMLElement {
    private observer: MutationObserver | null = null;

    connectedCallback(): void {
        this.addEventListener("input", this.onInput);
        this.addEventListener("page-change", this.onPageChange);
        this.addEventListener("form:success", this.onAssignmentSuccess);
        this.observer = new MutationObserver(() => this.apply());
        this.observer.observe(this, { childList: true, subtree: true });
        queueMicrotask(() => this.apply());
    }

    disconnectedCallback(): void {
        this.removeEventListener("input", this.onInput);
        this.removeEventListener("page-change", this.onPageChange);
        this.removeEventListener("form:success", this.onAssignmentSuccess);
        this.observer?.disconnect();
        this.observer = null;
    }

    private readonly onInput = (event: Event): void => {
        if (event.target instanceof Element && event.target.matches("[data-dashboard-member-search]")) {
            setState("dashboard-member-page", "1", this.ownerDocument);
        }
    };

    private readonly onPageChange = (event: Event): void => {
        if (!(event instanceof CustomEvent) || !(event.target instanceof Element)) {
            return;
        }
        if (!event.target.matches("[data-dashboard-member-pagination]")) {
            return;
        }
        const page = event.detail?.page;
        if (Number.isSafeInteger(page) && page > 0) {
            setState("dashboard-member-page", String(page), this.ownerDocument);
        }
    };

    private readonly onAssignmentSuccess = (event: Event): void => {
        if (event.target instanceof Element && event.target.matches("[data-dashboard-member-assignment]")) {
            event.stopPropagation();
        }
    };

    private apply(): void {
        const rows = Array.from(this.querySelectorAll<HTMLElement>("[data-dashboard-member-row]"));
        const empty = this.querySelector<HTMLElement>("[data-dashboard-member-no-results]");
        if (empty) {
            empty.hidden = rows.length > 0;
        }
    }
}
