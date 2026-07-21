import { goto } from "./emit";

export const handlePrev = (host: HTMLElement, page: number) => {
    if (page <= 1) {
        return;
    }
    goto(host, page, page - 1);
};

export const handleNext = (host: HTMLElement, page: number, total: number) => {
    if (page >= total) {
        return;
    }
    goto(host, page, page + 1);
};

export const handlePageClick = (host: HTMLElement, page: number, e: Event) => {
    const target = (e.target as HTMLElement).closest<HTMLButtonElement>(".page");
    if (!target) {
        return;
    }
    const n = Number(target.dataset.page);
    if (Number.isFinite(n)) {
        goto(host, page, n);
    }
};
