export class OpenDialog extends HTMLElement {
    connectedCallback(): void {
        this.addEventListener("click", this.handleClick);
    }

    disconnectedCallback(): void {
        this.removeEventListener("click", this.handleClick);
    }

    private handleClick = (): void => {
        const target = this.getAttribute("target");
        if (!target) return;
        const dialog = document.getElementById(target) as HTMLDialogElement | null;
        dialog?.showModal?.();
    };
}

customElements.define("w13c-open-dialog", OpenDialog);
