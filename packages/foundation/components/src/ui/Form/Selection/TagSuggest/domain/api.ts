import type { Suggestion } from "../types";

export const loadSuggestions = async (host: HTMLElement): Promise<Suggestion[] | null> => {
    const resource = host.getAttribute("resource");
    if (!resource) {
        return null;
    }

    const apiBase = host.getAttribute("api") || "../api/tags";
    const url = new URL(apiBase, window.location.href);
    url.searchParams.set("resource", resource);

    try {
        const res = await fetch(url);
        if (!res.ok) {
            return null;
        }
        return (await res.json()) as Suggestion[];
    } catch {
        return null;
    }
};
