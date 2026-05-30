export const setSelectedClass = (options: HTMLElement[], value: string) => {
    options.forEach(li => li.classList.toggle('selected', li.dataset.value === value));
};

export const setLabel = (labelEl: HTMLElement | null, host: HTMLElement) => {
    if (!labelEl) return;
    const text = host.getAttribute('label') ?? host.getAttribute('name') ?? '';
    labelEl.textContent = text;
    // Hide the empty label so it doesn't occupy a flex slot and leave the column
    // `gap` above the trigger — which made a label-less select taller than a
    // label-less p9r-input (mirrors p9r-input's own `label.hidden` behaviour).
    labelEl.hidden = text === '';
};
