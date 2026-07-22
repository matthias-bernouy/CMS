import { setBindingFilters } from "@bernouy/components";

let configured = false;

export function configureDashboardBindingFilters(): void {
    if (configured) {
        return;
    }
    configured = true;
    setBindingFilters({
        json: (value) => (value === undefined ? undefined : JSON.stringify(value)),
    });
}
