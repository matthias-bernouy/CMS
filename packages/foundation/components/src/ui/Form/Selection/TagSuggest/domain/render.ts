import type { Suggestion } from "../types";

export const renderTags = (
    display: HTMLElement | null,
    mode: string,
    tags: string[],
    onRemove: (index: number) => void,
) => {
    if (!display) {
        return;
    }
    display.innerHTML = "";
    if (mode !== "multiple") {
        return;
    }

    tags.forEach((tag, index) => {
        const el = document.createElement("p9r-tag");
        el.setAttribute("color", "primary");
        el.setAttribute("part", "chip");
        el.setAttribute("role", "listitem");
        el.textContent = tag;
        el.title = `Remove ${tag}`;
        el.setAttribute("aria-label", `Remove ${tag}`);
        el.addEventListener("click", () => onRemove(index));
        display.appendChild(el);
    });
};

export const renderSuggestions = (
    suggestionsEl: HTMLElement | null,
    input: HTMLInputElement | null,
    suggestions: Suggestion[],
    activeIndex: number,
    uid: string,
    onPick: (value: string) => void,
) => {
    if (!suggestionsEl || !input) {
        return;
    }
    if (suggestions.length === 0) {
        hideSuggestions(suggestionsEl, input);
        return;
    }

    suggestionsEl.innerHTML = "";
    suggestions.forEach((s, i) => {
        const row = document.createElement("div");
        row.className = "suggestion";
        row.id = `${uid}-opt-${i}`;
        row.setAttribute("role", "option");
        row.setAttribute("part", "option");
        const active = i === activeIndex;
        row.dataset.active = String(active);
        row.setAttribute("aria-selected", String(active));

        const name = document.createElement("span");
        name.className = "name";
        name.textContent = s.value;
        row.appendChild(name);

        const badge = document.createElement("p9r-tag");
        badge.setAttribute("color", "secondary");
        badge.setAttribute("part", "count");
        badge.textContent = String(s.count);
        row.appendChild(badge);

        row.addEventListener("mousedown", (ev) => {
            ev.preventDefault();
            onPick(s.value);
        });

        suggestionsEl.appendChild(row);
    });
    suggestionsEl.hidden = false;
    input.setAttribute("aria-expanded", "true");

    if (activeIndex >= 0) {
        input.setAttribute("aria-activedescendant", `${uid}-opt-${activeIndex}`);
    } else {
        input.removeAttribute("aria-activedescendant");
    }
};

export const hideSuggestions = (suggestionsEl: HTMLElement | null, input: HTMLInputElement | null) => {
    if (suggestionsEl) {
        suggestionsEl.hidden = true;
    }
    if (input) {
        input.setAttribute("aria-expanded", "false");
        input.removeAttribute("aria-activedescendant");
    }
};
