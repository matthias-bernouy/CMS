import { asRepeatRange, CMS_REPEAT_RANGE_MAX, isCmsRepeatRangeCount, parseRepeat } from "@bernouy/cms-content/editor";

const ALIAS_PATTERN = /^[A-Za-z_$][A-Za-z0-9_$]*$/;

export function renderRepeatRangeDetails(container: HTMLElement): void {
    container.replaceChildren();
    const content = document.createElement("div");
    content.className = "range-description";
    const heading = document.createElement("strong");
    heading.textContent = "Repeat a fixed number of times";
    const description = document.createElement("span");
    description.textContent = "Each copy receives its zero-based position through the alias.";
    content.append(heading, description);
    container.append(content);
}

export function renderRepeatRangeBinding(
    container: HTMLElement,
    onSelect: (path: string, alias: string) => void,
): void {
    container.replaceChildren();
    const scroll = document.createElement("div");
    scroll.className = "binding-scroll";
    const heading = document.createElement("div");
    heading.className = "details-eyebrow";
    heading.textContent = "Binding";
    const config = document.createElement("section");
    config.className = "binding-config";
    const count = numberInput("Count", 5);
    const alias = textInput("Alias", "index");
    config.append(count.label, alias.label);
    scroll.append(heading, config);

    const insert = document.createElement("button");
    insert.className = "insert";
    insert.type = "button";
    insert.textContent = "Use repeat";
    insert.addEventListener("click", () => {
        const countValue = count.input.value.trim();
        const rangeCount = Number(countValue);
        const rangeAlias = alias.input.value.trim();
        if (!countValue || !isCmsRepeatRangeCount(rangeCount) || !ALIAS_PATTERN.test(rangeAlias)) {
            count.input.reportValidity?.();
            alias.input.reportValidity?.();
            return;
        }
        const repeat = parseRepeat(asRepeatRange({ count: rangeCount, alias: rangeAlias }));
        if (repeat?.alias) {
            onSelect(repeat.path, repeat.alias);
        }
    });

    const footer = document.createElement("footer");
    footer.className = "binding-footer";
    footer.append(insert);
    container.append(scroll, footer);
}

function numberInput(text: string, value: number): { label: HTMLLabelElement; input: HTMLInputElement } {
    const label = document.createElement("label");
    label.textContent = text;
    const input = document.createElement("input");
    input.className = "count";
    input.type = "number";
    input.min = "0";
    input.max = String(CMS_REPEAT_RANGE_MAX);
    input.step = "1";
    input.required = true;
    input.value = String(value);
    label.append(input);
    return { label, input };
}

function textInput(text: string, value: string): { label: HTMLLabelElement; input: HTMLInputElement } {
    const label = document.createElement("label");
    label.textContent = text;
    const input = document.createElement("input");
    input.className = "alias";
    input.pattern = "[A-Za-z_$][A-Za-z0-9_$]*";
    input.required = true;
    input.value = value;
    label.append(input);
    return { label, input };
}
