export const setSelectedClass = (options: HTMLElement[], value: string) => {
    options.forEach(li => li.classList.toggle('selected', li.dataset.value === value));
};

export const setLabel = (labelEl: HTMLElement | null, host: HTMLElement) => {
    if (!labelEl) return;
    labelEl.textContent = host.getAttribute('label') ?? host.getAttribute('name') ?? '';
};
