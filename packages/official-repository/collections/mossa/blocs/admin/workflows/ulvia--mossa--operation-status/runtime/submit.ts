import { mutationFormRequest } from "@bernouy/cms-content/browser";

type Feedback = { loading(): void; failed(): void; accepted(id: string): void };

export function operationAction(root: HTMLElement, feedback: Feedback): () => void {
    let stopped = false;
    let running = false;
    const submit = (event: SubmitEvent): void => {
        const forms = root.querySelectorAll<HTMLFormElement>("form[cms-mutation]");
        const form = event.target;
        if (
            !(form instanceof HTMLFormElement) ||
            forms.length !== 1 ||
            forms[0] !== form ||
            form.closest('[cms-bloc="ulvia--mossa--operation-status"]') !== root
        ) {
            return;
        }
        const alias =
            form
                .getAttribute("cms-mutation")
                ?.split(/\s+as\s+/u)
                .at(-1) ?? "";
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/u.test(alias)) {
            return;
        }
        event.preventDefault();
        event.stopImmediatePropagation();
        if (running || !form.reportValidity()) {
            return;
        }
        running = true;
        feedback.loading();
        void mutationFormRequest(root, alias)
            .then((result) => {
                if (stopped || !root.isConnected) {
                    return;
                }
                // Operation commands acknowledge a handle before their terminal output exists.
                const id = (result as { operationId?: unknown })?.operationId;
                if (typeof id !== "string" || !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/iu.test(id)) {
                    throw new Error("Invalid operation acknowledgement");
                }
                feedback.accepted(id);
            })
            .catch(() => {
                if (!stopped && root.isConnected) {
                    feedback.failed();
                }
            })
            .finally(() => {
                running = false;
            });
    };
    root.addEventListener("submit", submit, true);
    return () => {
        stopped = true;
        root.removeEventListener("submit", submit, true);
    };
}
