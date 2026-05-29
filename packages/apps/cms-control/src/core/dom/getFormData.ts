

export function getFormData(formEle: HTMLFormElement, slotTarget: HTMLSlotElement) {
    const formData = new FormData(formEle);

    const elements = slotTarget?.assignedElements();
    if (!elements) return formData;

    for (const element of elements) {
        const name = element.getAttribute('name');
        const value = (element as any).value;
        
        if (name && value !== undefined && value !== "") {
            formData.append(name, value);
        }

        const nestedInputs = element.querySelectorAll<HTMLElement>('[name]');
        for ( const input of nestedInputs as any ){
            if ( !input.name || !input.value ) continue;
            formData.set(input.name, input.value);
        }
    }

    return formData;
}