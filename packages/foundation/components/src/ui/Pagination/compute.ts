export const intAttr = (host: HTMLElement, name: string, fallback: number): number => {
    const n = parseInt(host.getAttribute(name) ?? "", 10);
    return Number.isFinite(n) && n > 0 ? n : fallback;
};

export const buildItems = (page: number, total: number, siblings: number, boundary: number): Array<number | "…"> => {
    const items: Array<number | "…"> = [];
    const start = Math.max(1, page - siblings);
    const end = Math.min(total, page + siblings);

    const head = Array.from({ length: Math.min(boundary, total) }, (_, i) => i + 1);
    const tail = Array.from({ length: Math.min(boundary, total) }, (_, i) => total - i).reverse();
    const middle: number[] = [];
    for (let i = start; i <= end; i++) {
        middle.push(i);
    }

    const merged = Array.from(new Set([...head, ...middle, ...tail])).sort((a, b) => a - b);
    let prev = 0;
    for (const n of merged) {
        if (prev > 0 && n - prev > 1) {
            items.push("…");
        }
        items.push(n);
        prev = n;
    }
    return items;
};
