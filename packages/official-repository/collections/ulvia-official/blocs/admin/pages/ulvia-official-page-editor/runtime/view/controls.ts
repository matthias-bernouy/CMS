type EditorControl = "input" | "select" | "textarea" | "toggle";

const controlBlocs: Record<EditorControl, string> = {
    input: "ulvia-official-input",
    select: "ulvia-official-select",
    textarea: "ulvia-official-textarea",
    toggle: "ulvia-official-toggle",
};

export function wrapEditorControl<T extends HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
    control: T,
    kind: EditorControl,
): HTMLDivElement {
    const root = document.createElement("div");
    root.setAttribute("cms-bloc", controlBlocs[kind]);
    root.setAttribute("size", "sm");
    root.append(control);
    return root;
}
