import type { CmsSourceState, Editor } from "@bernouy/cms-content/editor";
import type { ConditionPickerCondition, ConditionPickerSource } from "./types";

const STATES: CmsSourceState[] = ["loaded", "loading", "empty", "error"];

export function sourceStateKey(sources: ConditionPickerSource[], editor: Editor, state: CmsSourceState): string {
    return `${sources.findIndex((source) => source.editor === editor)}:${state}`;
}

export function renderSourceStateMode(options: {
    sources: ConditionPickerSource[];
    selected: Set<string>;
    onChange(): void;
}): HTMLElement {
    const root = document.createElement("div");
    root.className = "mode-panel";
    if (options.sources.length === 0) {
        const empty = document.createElement("div");
        empty.className = "empty";
        empty.textContent = "No source available.";
        root.append(empty);
        return root;
    }

    for (const source of options.sources) {
        root.append(renderSource(source, options));
    }
    return root;
}

export function selectedSourceConditions(
    sources: ConditionPickerSource[],
    selected: Set<string>,
): ConditionPickerCondition[] {
    const conditions: ConditionPickerCondition[] = [];
    for (const source of sources) {
        for (const state of STATES) {
            if (selected.has(sourceStateKey(sources, source.editor, state))) {
                conditions.push({ sourceEditor: source.editor, sourceState: state });
            }
        }
    }
    return conditions;
}

function renderSource(
    source: ConditionPickerSource,
    options: {
        sources: ConditionPickerSource[];
        selected: Set<string>;
        onChange(): void;
    },
): HTMLElement {
    const section = document.createElement("section");
    section.className = "source";
    section.append(textBlock("source-title", source.label));
    if (source.sourceName) {
        section.append(textBlock("source-name", `Source: ${source.sourceName}`));
    }

    const states = document.createElement("div");
    states.className = "states";
    for (const state of STATES) {
        states.append(renderState(source, state, options));
    }
    section.append(states);
    return section;
}

function renderState(
    source: ConditionPickerSource,
    state: CmsSourceState,
    options: {
        sources: ConditionPickerSource[];
        selected: Set<string>;
        onChange(): void;
    },
): HTMLElement {
    const key = sourceStateKey(options.sources, source.editor, state);
    const label = document.createElement("label");
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = options.selected.has(key);
    input.addEventListener("change", () => {
        input.checked ? options.selected.add(key) : options.selected.delete(key);
        options.onChange();
    });
    const text = document.createElement("span");
    text.textContent = state;
    label.append(input, text);
    return label;
}

function textBlock(className: string, text: string): HTMLElement {
    const element = document.createElement("div");
    element.className = className;
    element.textContent = text;
    return element;
}
