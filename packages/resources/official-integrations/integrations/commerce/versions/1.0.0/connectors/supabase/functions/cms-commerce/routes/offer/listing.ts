export function addAmountFilter(params: URLSearchParams, operator: "gte" | "lte", raw: string | null): void {
    const euros = Number(raw);
    if (raw && Number.isFinite(euros) && euros >= 0) {
        params.append("accepted_price_amount", `${operator}.${Math.round(euros * 100)}`);
    }
}

export function offerOrder(sort: string | null): string {
    if (sort === "price-asc") return "accepted_price_amount.asc.nullslast,updated_at.desc,id.desc";
    if (sort === "price-desc") return "accepted_price_amount.desc.nullslast,updated_at.desc,id.desc";
    return "updated_at.desc,id.desc";
}
