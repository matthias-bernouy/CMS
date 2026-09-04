import { Component } from "@bernouy/components/base";
import {
    DASHBOARD_SCHEMA_VERSION,
    type DashboardDefinition,
    type DashboardViewDefinition,
    type DashboardViewMount,
} from "@bernouy/cms-dashboards";
import { navigationEditor, readonlyNavigation, serializeNavigation } from "../../workspace/navigation";
import navigationCss from "../../workspace/styles/navigation.css" with { type: "text" };
import css from "../style.css" with { type: "text" };
import template from "../template.html" with { type: "text" };

const NAVIGATION_LABEL_MAX_LENGTH = 16;

export abstract class DashboardNavigationEditorState extends Component {
    protected mounts: DashboardViewMount[] = [];
    protected views: DashboardViewDefinition[] = [];
    private readonly internals = this.attachInternals();

    constructor() {
        super({ css: `${css}${navigationCss}`, template: template as unknown as string });
    }

    attributeChangedCallback(): void {
        if (this.isConnected) {
            this.renderEditor();
        }
    }

    formResetCallback(): void {
        this.renderEditor();
    }

    formStateRestoreCallback(state: string | File | FormData | null): void {
        if (typeof state === "string") {
            this.mounts = parseJson(state, []);
            this.renderCurrentState();
        }
    }

    get value(): string {
        return JSON.stringify(this.currentMounts());
    }

    protected renderEditor(): void {
        this.mounts = parseJson(this.getAttribute("value"), []);
        this.views = parseJson(this.getAttribute("views"), []);
        this.renderCurrentState();
    }

    protected syncFormValue(): void {
        if (this.hasAttribute("readonly")) {
            this.internals.setValidity({});
            this.internals.setFormValue(null);
            return;
        }
        this.mounts = this.currentMounts();
        const invalid = findLongLabel(this.mounts);
        this.internals.setValidity(
            invalid ? { customError: true } : {},
            invalid ? `“${invalid}” exceeds the 16-character navigation label limit.` : "",
        );
        this.internals.setFormValue(JSON.stringify(this.mounts));
    }

    private renderCurrentState(): void {
        const target = this.shadowRoot?.querySelector<HTMLElement>("[data-navigation-editor]");
        if (!target) {
            return;
        }
        const dashboard = editorDashboard(this.mounts);
        target.replaceChildren(
            this.hasAttribute("readonly")
                ? readonlyNavigation(dashboard, this.views)
                : navigationEditor(dashboard, this.views),
        );
        this.syncFormValue();
    }

    private currentMounts(): DashboardViewMount[] {
        return this.shadowRoot ? serializeNavigation(this.shadowRoot) : this.mounts;
    }
}

function findLongLabel(mounts: DashboardViewMount[]): string | undefined {
    for (const mount of mounts) {
        if (mount.label && mount.label.length > NAVIGATION_LABEL_MAX_LENGTH) {
            return mount.label;
        }
        const child = findLongLabel(mount.children ?? []);
        if (child) {
            return child;
        }
    }
    return undefined;
}

function editorDashboard(views: DashboardViewMount[]): DashboardDefinition {
    return {
        schemaVersion: DASHBOARD_SCHEMA_VERSION,
        id: "navigation-editor",
        meta: { name: "Navigation editor" },
        homeView: "",
        views,
        origin: { kind: "site", createdBy: "configuration" },
        status: "published",
        revision: "editor",
    };
}

function parseJson<T>(value: string | null, fallback: T): T {
    if (!value) {
        return fallback;
    }
    for (const candidate of [value, decode(value)]) {
        try {
            return JSON.parse(candidate) as T;
        } catch {
            // Try the URL-decoded representation before using the safe fallback.
        }
    }
    return fallback;
}

function decode(value: string): string {
    try {
        return decodeURIComponent(value);
    } catch {
        return value;
    }
}
