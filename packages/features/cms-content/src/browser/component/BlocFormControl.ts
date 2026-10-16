export const CMS_BLOC_FORM_CONTROL_READY_EVENT = "cms-bloc:form-control-ready";

const CMS_BLOC_FORM_CONTROL_CONNECT_EVENT = "cms-bloc:form-control-connect";
const CMS_BLOC_FORM_CONTROL_REQUEST_EVENT = "cms-bloc:form-control-request";
const FORM_CONTROL_SELECTOR = "input, select, textarea";

let nextFormControlId = 0;

export type BlocFormControl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;

export type FormControlConnection = {
    readonly descriptions: readonly HTMLElement[];
    readonly label: HTMLLabelElement;
};

type FormControlRequest = {
    control: BlocFormControl | null;
};

/** Install the native form-control protocol owned by every retained Bloc root. */
export function installBlocFormControlProvider(root: HTMLElement): () => void {
    const connect = (event: Event): void => {
        if (!(event instanceof CustomEvent) || event.target !== root) {
            return;
        }
        const control = ownedFormControl(root);
        if (!control) {
            return;
        }
        const connection = event.detail as FormControlConnection;
        control.id ||= `ulvia-form-control-${++nextFormControlId}`;
        connection.label.htmlFor = control.id;
        const references = new Set((control.getAttribute("aria-describedby") ?? "").split(/\s+/u).filter(Boolean));
        for (const description of connection.descriptions) {
            description.id ||= `${control.id}-${description.getAttribute("part")?.split(/\s+/u)[0] ?? "description"}`;
            references.add(description.id);
        }
        if (references.size > 0) {
            control.setAttribute("aria-describedby", Array.from(references).join(" "));
        }
    };
    const provide = (event: Event): void => {
        if (!(event instanceof CustomEvent) || event.target !== root) {
            return;
        }
        (event.detail as FormControlRequest).control = ownedFormControl(root);
    };
    root.addEventListener(CMS_BLOC_FORM_CONTROL_CONNECT_EVENT, connect);
    root.addEventListener(CMS_BLOC_FORM_CONTROL_REQUEST_EVENT, provide);
    return () => {
        root.removeEventListener(CMS_BLOC_FORM_CONTROL_CONNECT_EVENT, connect);
        root.removeEventListener(CMS_BLOC_FORM_CONTROL_REQUEST_EVENT, provide);
    };
}

export function connectBlocFormControl(root: HTMLElement, connection: FormControlConnection): void {
    root.dispatchEvent(
        new CustomEvent<FormControlConnection>(CMS_BLOC_FORM_CONTROL_CONNECT_EVENT, { detail: connection }),
    );
}

export function requestBlocFormControl(root: HTMLElement): BlocFormControl | null {
    const request: FormControlRequest = { control: null };
    root.dispatchEvent(new CustomEvent<FormControlRequest>(CMS_BLOC_FORM_CONTROL_REQUEST_EVENT, { detail: request }));
    return request.control;
}

function ownedFormControl(root: HTMLElement): BlocFormControl | null {
    const candidates = root.matches(FORM_CONTROL_SELECTOR)
        ? [root]
        : Array.from(root.querySelectorAll<HTMLElement>(FORM_CONTROL_SELECTOR));
    return (
        (candidates.find((element) => element.closest("[cms-bloc]") === root) as BlocFormControl | undefined) ?? null
    );
}
