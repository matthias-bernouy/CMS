const panels = [...document.querySelectorAll("[data-panel]")];
const markers = [...document.querySelectorAll("[data-step-marker]")];
const backButton = document.querySelector("[data-back]");
const nextButton = document.querySelector("[data-next]");
const progressBar = document.querySelector("[data-progress-bar]");
const progressLabel = document.querySelector("[data-progress-label]");
const saveLabel = document.querySelector("[data-save-label]");
const success = document.querySelector(".success");
const actions = document.querySelector(".actions");
const form = document.querySelector("form");
let currentStep = 2;

function render() {
    for (const panel of panels) {
        panel.hidden = Number(panel.dataset.panel) !== currentStep;
    }
    for (const marker of markers) {
        const step = Number(marker.dataset.stepMarker);
        marker.classList.toggle("is-current", step === currentStep);
        marker.classList.toggle("is-complete", step < currentStep);
        marker.querySelector(".step-dot").textContent = step < currentStep ? "✓" : String(step);
    }
    backButton.disabled = currentStep === 1;
    nextButton.firstChild.textContent = currentStep === panels.length ? "Finish " : "Continue ";
    progressBar.style.width = `${(currentStep / panels.length) * 100}%`;
    progressLabel.textContent = `Step ${currentStep} of ${panels.length}`;
}

function validateCurrentPanel() {
    const panel = panels.find((item) => Number(item.dataset.panel) === currentStep);
    const fields = [...panel.querySelectorAll("input, select, textarea")];
    for (const field of fields) {
        field.toggleAttribute("aria-invalid", !field.checkValidity());
    }
    const firstInvalid = fields.find((field) => !field.checkValidity());
    firstInvalid?.focus();
    return !firstInvalid;
}

nextButton.addEventListener("click", () => {
    if (!validateCurrentPanel()) {
        return;
    }
    if (currentStep < panels.length) {
        currentStep += 1;
        render();
        return;
    }
    for (const panel of panels) {
        panel.hidden = true;
    }
    success.hidden = false;
    actions.hidden = true;
});

backButton.addEventListener("click", () => {
    currentStep = Math.max(1, currentStep - 1);
    render();
});

form.addEventListener("input", (event) => {
    event.target.removeAttribute("aria-invalid");
    saveLabel.textContent = "Saving…";
    window.clearTimeout(form.saveTimer);
    form.saveTimer = window.setTimeout(() => {
        saveLabel.textContent = "Draft saved";
    }, 450);
});

document.querySelector("[data-restart]").addEventListener("click", () => {
    currentStep = 1;
    success.hidden = true;
    actions.hidden = false;
    render();
});

render();
