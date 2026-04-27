interface FormDialogHost extends HTMLElement {
    close(): void;
}

export const handleBackdropClick = (host: FormDialogHost, e: MouseEvent) => {
    const dialog = host.shadowRoot?.querySelector('dialog');
    if (!dialog) return;
    if (e.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    const isInDialog = (
        rect.top <= e.clientY && e.clientY <= rect.top + rect.height &&
        rect.left <= e.clientX && e.clientX <= rect.left + rect.width
    );
    if (!isInDialog) host.close();
};

export const handleFormData = (host: HTMLElement, e: FormDataEvent) => {
    const slottedInputs = host.querySelectorAll<HTMLElement>('[name]');
    slottedInputs.forEach((el) => {
        const name = el.getAttribute('name');
        const value = (el as unknown as { value?: unknown }).value;
        if (name && value !== undefined && value !== null && value !== '') {
            e.formData.append(name, String(value));
        }
    });
};
