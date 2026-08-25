import { setSelectedClass } from "../compute";

export const buildOptionList = (
    light: HTMLElement,
    list: HTMLElement | null,
    onSelect: (value: string, label: string) => void,
): { options: HTMLElement[]; initialValue: string | null; initialLabel: string } => {
    const nativeOptions = Array.from(light.querySelectorAll("option")) as HTMLOptionElement[];
    if (list) {
        list.innerHTML = "";
    }
    const options: HTMLElement[] = [];

    let initialValue: string | null = null;
    let initialLabel = "";

    nativeOptions.forEach((opt, index) => {
        const li = document.createElement("li");
        li.className = "option";
        li.id = `option-${index}`;
        li.setAttribute("role", "option");
        li.textContent = opt.textContent;
        li.dataset.value = opt.value;
        li.dataset.disabled = String(opt.disabled);
        li.setAttribute("aria-disabled", String(opt.disabled));
        li.addEventListener("click", () => {
            if (!opt.disabled) {
                onSelect(opt.value, opt.textContent ?? "");
            }
        });
        list?.appendChild(li);
        options.push(li);

        if (opt.hasAttribute("selected") && initialValue === null) {
            initialValue = opt.value;
            initialLabel = opt.textContent ?? "";
        }
    });

    if (initialValue === null && nativeOptions.length > 0) {
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
