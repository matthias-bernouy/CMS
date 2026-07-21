import { setSelectedClass } from "../compute";

export const buildOptionList = (
    light: HTMLElement,
    list: HTMLElement | null,
    onSelect: (value: string, label: string) => void,
): { options: HTMLElement[]; initialValue: string; initialLabel: string } => {
    const nativeOptions = Array.from(light.querySelectorAll("option")) as HTMLOptionElement[];
    if (list) {
        list.innerHTML = "";
    }
    const options: HTMLElement[] = [];

    let initialValue = "";
    let initialLabel = "";

    nativeOptions.forEach((opt) => {
        const li = document.createElement("li");
        li.className = "option";
        li.textContent = opt.textContent;
        li.dataset.value = opt.value;
        li.addEventListener("click", () => onSelect(opt.value, opt.textContent ?? ""));
        list?.appendChild(li);
        options.push(li);

        if (opt.hasAttribute("selected") && !initialValue) {
            initialValue = opt.value;
            initialLabel = opt.textContent ?? "";
        }
    });

    if (!initialValue && nativeOptions.length > 0) {
        initialValue = nativeOptions[0]!.value;
        initialLabel = nativeOptions[0]!.textContent ?? "";
    }

    return { options, initialValue, initialLabel };
};

export const setValue = (options: HTMLElement[], display: HTMLElement | null, value: string, label: string) => {
    if (display) {
        display.textContent = label;
    }
    setSelectedClass(options, value);
};
