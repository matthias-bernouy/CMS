const SECTION_TAG = "RESTAURANT-MENU-SECTION";
let catalogCount = 0;

type MenuSection = HTMLElement & { inert: boolean };

export class RestaurantMenuCatalogController {
    #activeIndex = 0;
    #catalogId = "";
    #categories?: HTMLElement;
    #observer?: MutationObserver;
    #slot?: HTMLSlotElement;

    constructor(private readonly host: HTMLElement) {}

    connect() {
        this.#catalogId = this.host.id || `restaurant-menu-catalog-${++catalogCount}`;
        this.#categories = this.host.shadowRoot?.querySelector<HTMLElement>('[part="categories"]') ?? undefined;
        this.#slot = this.host.shadowRoot?.querySelector<HTMLSlotElement>("slot:not([name])") ?? undefined;
        this.#categories?.addEventListener("click", this.#onClick);
        this.#categories?.addEventListener("keydown", this.#onKeyDown);
        this.#slot?.addEventListener("slotchange", this.refresh);
        this.#observer = new MutationObserver(this.refresh);
        this.#observer.observe(this.host, {
            childList: true,
            subtree: true,
            characterData: true,
            attributes: true,
            attributeFilter: ["anchor"],
        });
        this.refresh();
    }

    disconnect() {
        this.#categories?.removeEventListener("click", this.#onClick);
        this.#categories?.removeEventListener("keydown", this.#onKeyDown);
        this.#slot?.removeEventListener("slotchange", this.refresh);
        this.#observer?.disconnect();
        this.#observer = undefined;
    }

    refresh = () => {
        const sections = this.#sections();
        if (!this.#categories) {
            return;
        }
        this.#categories.replaceChildren(...sections.map((section, index) => this.#button(section, index)));
        this.#categories.setAttribute("aria-label", this.host.getAttribute("navigation-label") || "Menu categories");
        this.#categories.setAttribute("role", "tablist");
        this.#activeIndex = Math.min(this.#activeIndex, Math.max(0, sections.length - 1));
        this.#applySelection(sections);
        this.host.toggleAttribute("data-menu-ready", true);
    };

    #sections(): MenuSection[] {
        return Array.from(this.host.children).filter((child): child is MenuSection => child.tagName === SECTION_TAG);
    }

    #button(section: HTMLElement, index: number): HTMLButtonElement {
        const label =
            section.querySelector<HTMLElement>(':scope > [slot="title"]')?.textContent?.trim() ||
            `Section ${index + 1}`;
        const anchor = section.getAttribute("anchor")?.trim() || this.#slug(label) || `section-${index + 1}`;
        const panelId = section.id || `${this.#catalogId}-${anchor}`;
        const tabId = `${panelId}-tab`;
        section.id = panelId;
        section.setAttribute("aria-labelledby", tabId);
        section.setAttribute("role", "tabpanel");

        const button = document.createElement("button");
        button.type = "button";
        button.id = tabId;
        button.dataset.index = String(index);
        button.setAttribute("aria-controls", panelId);
        button.setAttribute("role", "tab");

        const icon = section.querySelector<SVGElement>(':scope > svg[slot="icon"]')?.cloneNode(true);
        if (icon instanceof SVGElement) {
            icon.removeAttribute("slot");
            icon.setAttribute("aria-hidden", "true");
            icon.setAttribute("focusable", "false");
            const iconWrap = document.createElement("span");
            iconWrap.dataset.icon = "";
            iconWrap.append(icon);
            button.append(iconWrap);
        }
        const text = document.createElement("span");
        text.textContent = label;
        button.append(text);
        return button;
    }

    #applySelection(sections = this.#sections()) {
        const stacked = this.host.getAttribute("presentation") === "stacked";
        const buttons = Array.from(this.#categories?.querySelectorAll<HTMLButtonElement>("button") ?? []);
        sections.forEach((section, index) => {
            const selected = index === this.#activeIndex;
            section.dataset.menuActive = String(selected);
            section.inert = !stacked && !selected;
            if (stacked) {
                section.removeAttribute("aria-hidden");
                section.removeAttribute("aria-labelledby");
                section.removeAttribute("role");
            } else {
                section.setAttribute("aria-labelledby", `${section.id}-tab`);
                section.setAttribute("role", "tabpanel");
                if (selected) {
                    section.removeAttribute("aria-hidden");
                } else {
                    section.setAttribute("aria-hidden", "true");
                }
            }
            buttons[index]?.setAttribute("aria-selected", String(selected));
            buttons[index]?.setAttribute("tabindex", selected ? "0" : "-1");
        });
    }

    #select(index: number, focus = false) {
        const sections = this.#sections();
        if (index < 0 || index >= sections.length) {
            return;
        }
        this.#activeIndex = index;
        this.#applySelection(sections);
        const button = this.#categories?.querySelectorAll<HTMLButtonElement>("button")[index];
        const reducedMotion = matchMedia("(prefers-reduced-motion: reduce)").matches;
        button?.scrollIntoView({ behavior: reducedMotion ? "auto" : "smooth", block: "nearest", inline: "center" });
        if (focus) {
            button?.focus();
        }
    }

    #onClick = (event: Event) => {
        const button = (event.target as Element | null)?.closest<HTMLButtonElement>("button[data-index]");
        if (button) {
            this.#select(Number(button.dataset.index));
        }
    };

    #onKeyDown = (event: KeyboardEvent) => {
        const count = this.#sections().length;
        if (!count || !["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
            return;
        }
        event.preventDefault();
        const direction = event.key === "ArrowLeft" ? -1 : 1;
        const index =
            event.key === "Home"
                ? 0
                : event.key === "End"
                  ? count - 1
                  : (this.#activeIndex + direction + count) % count;
        this.#select(index, true);
    };

    #slug(value: string): string {
        return value
            .normalize("NFD")
            .replace(/[\u0300-\u036f]/g, "")
            .toLowerCase()
            .replace(/[^a-z0-9]+/g, "-")
            .replace(/^-|-$/g, "");
    }
}
