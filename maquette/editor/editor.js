const template = document.querySelector("#page-preview");

for (const slot of document.querySelectorAll("[data-preview-slot]")) {
    slot.append(template.content.cloneNode(true));
}

const concepts = Array.from(document.querySelectorAll("[data-concept]"));
const conceptButtons = Array.from(document.querySelectorAll("[data-concept-target]"));

function selectConcept(target, updateUrl = true) {
    const validTarget = concepts.some((concept) => concept.dataset.concept === target) ? target : "studio";
    for (const concept of concepts) {
        const active = concept.dataset.concept === validTarget;
        concept.hidden = !active;
        concept.classList.toggle("is-active", active);
    }
    for (const candidate of conceptButtons) {
        candidate.setAttribute("aria-pressed", String(candidate.dataset.conceptTarget === validTarget));
    }
    if (updateUrl) {
        const url = new URL(window.location.href);
        url.searchParams.set("concept", validTarget);
        window.history.replaceState(null, "", url);
    }
}

for (const button of conceptButtons) {
    button.addEventListener("click", () => {
        selectConcept(button.dataset.conceptTarget);
    });
}

selectConcept(new URL(window.location.href).searchParams.get("concept"), false);

for (const picker of document.querySelectorAll("[data-device-picker]")) {
    picker.addEventListener("click", (event) => {
        const button = event.target.closest("[data-device]");
        const concept = button?.closest("[data-concept]");
        const frame = concept?.querySelector("[data-preview-frame]");
        if (!button || !frame) {
            return;
        }
        frame.dataset.deviceView = button.dataset.device;
        for (const candidate of picker.querySelectorAll("[data-device]")) {
            candidate.setAttribute("aria-pressed", String(candidate === button));
        }
    });
}

for (const tabs of document.querySelectorAll("[data-tabs]")) {
    tabs.addEventListener("click", (event) => {
        const button = event.target.closest("[data-tab]");
        const inspector = tabs.closest(".review-inspector");
        if (!button || !inspector) {
            return;
        }
        for (const candidate of tabs.querySelectorAll("[data-tab]")) {
            candidate.classList.toggle("is-active", candidate === button);
        }
        for (const panel of inspector.querySelectorAll("[data-panel]")) {
            panel.classList.toggle("is-active", panel.dataset.panel === button.dataset.tab);
        }
    });
}
