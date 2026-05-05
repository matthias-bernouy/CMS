type NewFolderCallbacks = {
    onCreate: (name: string) => void;
};

export function setupNewFolder(host: HTMLElement, s: ShadowRoot, callbacks: NewFolderCallbacks) {
    const backdrop = s.getElementById("nf-backdrop")!;
    const input = s.getElementById("nf-input") as HTMLInputElement;
    const confirmBtn = s.getElementById("nf-confirm")!;
    const cancelBtn = s.getElementById("nf-cancel")!;

    const hide = () => backdrop.classList.remove("visible");

    const show = () => {
        input.value = "";
        backdrop.classList.add("visible");
        requestAnimationFrame(() => input.focus());
    };

    const create = () => {
        const name = input.value.trim();
        if (!name) return;
        hide();
        callbacks.onCreate(name);
    };

    host.addEventListener("new-folder", show);
    confirmBtn.addEventListener("click", create);
    cancelBtn.addEventListener("click", hide);
    backdrop.addEventListener("click", (e) => { if (e.target === backdrop) hide(); });
    input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") create();
        if (e.key === "Escape") hide();
    });

    document.addEventListener("keydown", (e) => {
        if (e.key === "Escape" && backdrop.classList.contains("visible")) {
            hide();
        }
    });
}
