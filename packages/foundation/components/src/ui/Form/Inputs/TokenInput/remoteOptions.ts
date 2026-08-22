import type { ComboOption } from "../../Selection/Combobox/types";

type RemoteOption =
    | string
    | {
          value?: unknown;
          label?: unknown;
      };

export class RemoteTokenOptions {
    private options: ComboOption[] = [];
    private load = 0;

    constructor(
        private readonly host: HTMLElement,
        private readonly onChange: () => void,
    ) {}

    connect(): void {
        this.reload();
    }

    disconnect(): void {
        this.load += 1;
    }

    reload(): void {
        const load = ++this.load;
        this.options = [];
        this.onChange();
        void loadRemoteTokenOptions(this.host).then((options) => {
            if (load !== this.load || !this.host.isConnected) {
                return;
            }
            this.options = options;
            this.onChange();
        });
    }

    merge(localOptions: ComboOption[]): ComboOption[] {
        const localValues = new Set(localOptions.map((option) => option.value));
        return [...localOptions, ...this.options.filter((option) => !localValues.has(option.value))];
    }
}

export async function loadRemoteTokenOptions(host: HTMLElement): Promise<ComboOption[]> {
    const api = host.getAttribute("api");
    if (!api) {
        return [];
    }
    const url = new URL(api, window.location.href);
    const resource = host.getAttribute("resource");
    if (resource) {
        url.searchParams.set("resource", resource);
    }
    try {
        const response = await fetch(url);
        if (!response.ok) {
            return [];
        }
        const body = await response.json();
        return remoteOptionsFrom(body);
    } catch {
        return [];
    }
}

export function remoteOptionsFrom(body: unknown): ComboOption[] {
    if (!Array.isArray(body)) {
        return [];
    }
    const options = new Map<string, ComboOption>();
    for (const item of body as RemoteOption[]) {
        const value = typeof item === "string" ? item : item?.value;
        if (typeof value !== "string" || !value || options.has(value)) {
            continue;
        }
        const label = item && typeof item === "object" && typeof item.label === "string" ? item.label : value;
        options.set(value, { value, label, disabled: false });
    }
    return [...options.values()];
}
