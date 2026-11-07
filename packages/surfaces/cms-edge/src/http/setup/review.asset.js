function node(tag, text, className) {
    const element = document.createElement(tag);
    element.textContent = text;
    if (className) {
        element.className = className;
    }
    return element;
}
export function renderReview(review) {
    const plan = review.plan;
    document.querySelector("#review-title").textContent = plan.root
        ? "Review your starting point."
        : "A blank canvas. All yours.";
    document.querySelector("#review-description").textContent = plan.root
        ? "These exact resources will be installed on your site."
        : "Your site will start without collections or pages. Nothing needs to be downloaded.";
    const summary = document.querySelector("#review-summary");
    summary.replaceChildren();
    for (const [count, label] of [
        [plan.collections.length, "collections"],
        [plan.pages.length, "pages"],
        [plan.contracts.length, "selected contracts used"],
    ]) {
        const item = node("span", "");
        item.append(node("strong", String(count)), document.createTextNode(label));
        summary.append(item);
    }
    const collections = document.querySelector("#review-collections");
    collections.replaceChildren();
    for (const collection of plan.collections) {
        const item = node("div", "", "resource");
        item.append(node("strong", `${collection.collectionId} · ${collection.version}`));
        const risk = collection.browserRisk;
        item.append(
            node(
                "p",
                risk.level === "none"
                    ? "No executable browser code declared."
                    : `${risk.javaScriptBlocs.length} browser scripts · ${risk.frameBlocs.length} embedded content blocks`,
            ),
        );
        if (risk.externalFrameOrigins.length) {
            item.append(node("p", `External content: ${risk.externalFrameOrigins.join(", ")}`));
        }
        collections.append(item);
    }
    const rows = document.querySelector("#review-pages");
    rows.replaceChildren();
    for (const page of plan.pages) {
        const row = document.createElement("tr");
        row.append(node("td", page.title), node("td", page.path), node("td", page.visible ? "Published" : "Draft"));
        rows.append(row);
    }
    document.querySelector("#page-details").hidden = plan.pages.length === 0;
    const hasCode = plan.collections.some(({ browserRisk }) => browserRisk.level !== "none");
    document.querySelector("#risk-consent").hidden = !hasCode;
    const consent = document.querySelector("#approve-code");
    consent.checked = false;
    consent.required = hasCode;
    consent.disabled = !hasCode;
    document.querySelector("#confirm").textContent = plan.root ? "Confirm and install →" : "Create an empty site →";
}
