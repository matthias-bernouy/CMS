import type { P9rSelectView } from "../P9rSelectView";

export class SelectKeyboard {
    activeIndex = -1;

    constructor(
        private readonly view: P9rSelectView,
        private readonly getOptions: () => HTMLElement[],
        private readonly getValue: () => string,
        private readonly select: (value: string, label: string) => void,
    ) {}

    handle(event: KeyboardEvent, isOpen: boolean, open: () => void): void {
        if (event.key === "ArrowDown" || event.key === "ArrowUp") {
            event.preventDefault();
            open();
            this.move(event.key === "ArrowDown" ? 1 : -1);
        } else if (isOpen && (event.key === "Home" || event.key === "End")) {
            event.preventDefault();
            this.moveToEdge(event.key === "Home");
        } else if (isOpen && (event.key === "Enter" || event.key === " ")) {
            event.preventDefault();
            this.selectActive();
        } else if (event.key === "Escape" && isOpen) {
            event.preventDefault();
            this.view.hide();
        } else if (event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey) {
            this.selectByPrefix(event.key, open);
        }
    }

    opened(): void {
        if (this.activeIndex < 0) {
            this.activeIndex = this.getOptions().findIndex((item) => item.dataset.value === this.getValue());
        }
        this.view.setActive(this.activeIndex, this.getOptions());
    }

    closed(): void {
        this.activeIndex = -1;
    }

    private move(step: number): void {
        const options = this.getOptions();
        if (options.length === 0) {
            return;
        }
        let next = this.activeIndex;
        for (let count = 0; count < options.length; count += 1) {
            next = (next + step + options.length) % options.length;
            if (options[next]?.dataset.disabled !== "true") {
                this.setActive(next);
                return;
            }
        }
    }

    private moveToEdge(fromStart: boolean): void {
        const options = this.getOptions();
        const indexes = options.map((_, index) => index);
        if (!fromStart) {
            indexes.reverse();
        }
        const index = indexes.find((item) => options[item]?.dataset.disabled !== "true");
        if (index !== undefined) {
            this.setActive(index);
        }
    }

    private selectActive(): void {
        const active = this.getOptions()[this.activeIndex];
        if (active && active.dataset.disabled !== "true") {
            this.select(active.dataset.value ?? "", active.textContent ?? "");
        }
    }

    private selectByPrefix(key: string, open: () => void): void {
        const prefix = key.toLocaleLowerCase();
        const options = this.getOptions();
        const index = options.findIndex(
            (item) =>
                item.dataset.disabled !== "true" && item.textContent?.trim().toLocaleLowerCase().startsWith(prefix),
        );
        if (index >= 0) {
            open();
            this.setActive(index);
        }
    }

    private setActive(index: number): void {
        this.activeIndex = index;
        this.view.setActive(index, this.getOptions());
    }
}
