import { route } from "../../Integrations/api";
import type { LibraryRoute } from "./model";

export const LIBRARY_ROUTE_EVENT = "cms-blocs:route";

export function currentRoute(): LibraryRoute {
    const params = new URL(location.href).searchParams;
    const legacy = params.get("integration");
    const collection = params.get("collection") ?? (legacy ? `managed:${legacy}` : "");
    const add = ["catalogue", "add"].includes(params.get("tab") ?? "") || params.has("setup");
    return {
        view: add ? "add" : collection ? "collection" : "library",
        collection,
        bloc: params.get("bloc") ?? "",
        query: params.get("q") ?? params.get("search") ?? "",
    };
}

export function libraryUrl(next: Partial<LibraryRoute> = {}): string {
    const params = new URLSearchParams();
    if (next.view === "add") {
        params.set("tab", "add");
    } else if (next.collection) {
        params.set("collection", next.collection);
    }
    if (next.bloc) {
        params.set("bloc", next.bloc);
    }
    if (next.query) {
        params.set("q", next.query);
    }
    return route(`/admin/blocs${params.size ? `?${params}` : ""}`);
}

export function navigate(next: Partial<LibraryRoute>, replace = false): void {
    history[replace ? "replaceState" : "pushState"](null, "", libraryUrl(next));
    window.dispatchEvent(new Event(LIBRARY_ROUTE_EVENT));
}

export function interceptLink(event: Event): boolean {
    return (
        !(event instanceof MouseEvent) ||
        !(event.button || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey)
    );
}
