import type { CollectionText } from "@bernouy/cms-repository/collections/texts";
import type { InstalledCollection } from "@bernouy/cms-repository/collections/installations";
import { languageLabel } from "./navigation";
export type TextInput = HTMLElement & { value: string };
export function renderTextRow(
    text: CollectionText,
    item: InstalledCollection,
    language: string,
    change: () => void,
    reset: () => void,
): HTMLTableRowElement {
    const row = document.createElement("tr");
    const key = row.insertCell();
    key.dataset.label = "Key";
    const code = document.createElement("code");
    code.textContent = text.id;
    key.append(code);
    const label = document.createElement("th");
    label.scope = "row";
    label.dataset.label = "Label";
    const strong = document.createElement("strong");
    strong.textContent = text.label ?? text.id;
    label.append(strong);
    if (text.description) {
        const description = document.createElement("span");
        description.textContent = text.description;
        label.append(description);
    }
    row.append(label);
    const base = row.insertCell();
    base.dataset.label = `Default · ${languageLabel(item.release.locale)}`;
    base.textContent = text.values[item.release.locale]!;
    const translated = row.insertCell();
    translated.dataset.label = languageLabel(language);
    const message =
        item.textOverrides[text.id]?.[language] ??
        text.values[language] ??
        text.values[language.split("-")[0]!] ??
        text.values[item.release.locale]!;
    const input = document.createElement("p9r-textarea") as TextInput;
    input.setAttribute("aria-label", `${text.label ?? text.id} · ${languageLabel(language)}`);
    input.setAttribute("rows", "3");
    input.setAttribute("maxlength", "8192");
    input.setAttribute("value", message);
    input.dataset.id = text.id;
    input.addEventListener("input", change);
    translated.append(input);
    const button = document.createElement("p9r-button");
    button.setAttribute("type", "button");
    button.setAttribute("variant", "text");
    button.setAttribute("data-reset", "");
    button.textContent = "Use collection default";
    button.addEventListener("click", reset);
    translated.append(button);
    return row;
}
