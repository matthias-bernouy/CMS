function node(tag, text, className) {
    const element = document.createElement(tag);
    element.textContent = text;
    if (className) {
        element.className = className;
    }
    return element;
}
export function renderReview(review) {
    const base = review.choice === "base";
    document.querySelector("#review-title").textContent = base
        ? "Review your starting point."
        : "A blank canvas. All yours.";
    document.querySelector("#review-description").textContent = base
        ? "These exact resources will be copied into your site."
        : "Your site will start without resources or pages. Nothing needs to be downloaded.";
    const summary = document.querySelector("#review-summary");
    summary.replaceChildren();
    for (const key of ["blocs", "assets", "texts", "pages"]) {
        const item = node("span", "");
        item.append(
            node("strong", String(review.counts[key])),
            document.createTextNode(key === "texts" ? "text namespaces" : key === "blocs" ? "blocks" : key),
        );
        summary.append(item);
    }
    const resources = document.querySelector("#review-resources");
    resources.replaceChildren();
    const risk = review.browserRisk;
    resources.append(
        node(
            "p",
            risk.level === "none"
                ? "No executable browser code declared."
                : `${risk.javaScriptBlocs.length} browser scripts · ${risk.frames.length} embedded content blocks`,
        ),
    );
    if (risk.javaScriptBlocs.length) {
        resources.append(node("p", `Browser scripts: ${risk.javaScriptBlocs.join(", ")}`));
    }
    for (const frame of risk.frames) {
        resources.append(
            node("p", `${frame.id}: ${frame.origins.join(", ")} · sandbox: ${frame.sandbox.join(", ") || "none"}`),
        );
    }
    const rows = document.querySelector("#review-pages");
    rows.replaceChildren();
    for (const page of review.pages) {
        const row = document.createElement("tr");
        row.append(node("td", page.path), node("td", page.visible ? "Published" : "Draft"));
        rows.append(row);
    }
    document.querySelector("#page-details").hidden = review.pages.length === 0;
    const hasCode = risk.level !== "none";
    document.querySelector("#risk-consent").hidden = !hasCode;
    const consent = document.querySelector("#approve-code");
    consent.checked = false;
    consent.required = hasCode;
    consent.disabled = !hasCode;
    document.querySelector("#confirm").textContent = base ? "Confirm and copy →" : "Create an empty site →";
}
