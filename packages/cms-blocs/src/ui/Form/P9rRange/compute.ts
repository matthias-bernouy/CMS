export const upgradeProperty = (host: HTMLElement, prop: string) => {
    if (Object.prototype.hasOwnProperty.call(host, prop)) {
        const value = (host as any)[prop];
        delete (host as any)[prop];
        (host as any)[prop] = value;
    }
};

export const clamp = (slider: HTMLInputElement | null, v: number): number => {
    if (!slider) return v;
    const mn = Number(slider.min);
    const mx = Number(slider.max);
    if (!Number.isFinite(v)) return mn;
    if (v < mn) return mn;
    if (v > mx) return mx;
    return v;
};

export const syncFill = (slider: HTMLInputElement | null, fill: HTMLElement | null) => {
    if (!slider || !fill) return;
    const min = Number(slider.min);
    const max = Number(slider.max);
    const val = Number(slider.value);
    const pct = max === min ? 0 : ((val - min) / (max - min)) * 100;
    fill.style.width = `${pct}%`;
};
