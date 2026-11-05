type EditorControl = "input" | "select" | "textarea" | "toggle";

const controlBlocs: Record<EditorControl, string> = {
    input: "ulvia--mossa--input",
    select: "ulvia--mossa--select",
    textarea: "ulvia--mossa--textarea",
    toggle: "ulvia--mossa--toggle",
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
