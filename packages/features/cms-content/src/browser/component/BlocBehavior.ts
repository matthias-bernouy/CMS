export type BlocCleanup = () => void;
export type BlocMount = (root: HTMLElement) => void | BlocCleanup;

export const CMS_BLOC_FORM_CONTROL_READY_EVENT = "cms-bloc:form-control-ready";
const CMS_BLOC_FORM_CONTROL_CONNECT_EVENT = "cms-bloc:form-control-connect";
const FORM_CONTROL_SELECTOR = "input, select, textarea";
let nextFormControlId = 0;

type FormControlConnection = {
    readonly descriptions: readonly HTMLElement[];
    readonly label: HTMLLabelElement;
};

/**
 * Optional behavior controller for a native Light DOM Bloc root. The
 * controller is deliberately not an Element: native DOM identity always
 * belongs to `blocRoot`.
 */
export abstract class BlocBehavior {
    protected constructor(protected readonly blocRoot: HTMLElement) {}

    protected get isConnected(): boolean {
        return this.blocRoot.isConnected;
    }

    protected get ownerDocument(): Document {
        return this.blocRoot.ownerDocument;
    }

    protected get style(): CSSStyleDeclaration {
        return this.blocRoot.style;
    }

    protected addEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
        this.blocRoot.addEventListener(type, listener);
    }

    protected removeEventListener(type: string, listener: EventListenerOrEventListenerObject): void {
        this.blocRoot.removeEventListener(type, listener);
    }

    protected closest<E extends Element = Element>(selectors: string): E | null {
        return this.blocRoot.closest<E>(selectors);
    }

    protected contains(other: Node | null): boolean {
        return this.blocRoot.contains(other);
    }

    protected getAttribute(name: string): string | null {
        return this.blocRoot.getAttribute(name);
    }

    protected getBoundingClientRect(): DOMRect {
        return this.blocRoot.getBoundingClientRect();
    }

    protected getRootNode(options?: GetRootNodeOptions): Node {
        return this.blocRoot.getRootNode(options);
    }

    protected hasAttribute(name: string): boolean {
        return this.blocRoot.hasAttribute(name);
    }

    protected querySelector<E extends Element = Element>(selectors: string): E | null {
        return this.querySelectorAll<E>(selectors)[0] ?? null;
    }

    protected querySelectorAll<E extends Element = Element>(selectors: string): readonly E[] {
        return Array.from(this.blocRoot.querySelectorAll<E>(selectors)).filter(
            (element) => element.closest(`[cms-bloc]`) === this.blocRoot,
        );
    }

    /** Find an immediate nested Bloc root without exposing its internal DOM. */
    protected queryBlocRoot<E extends HTMLElement = HTMLElement>(id?: string): E | null {
        return this.queryBlocRoots<E>(id)[0] ?? null;
    }

    /** Find immediate nested Bloc roots owned by this Bloc. */
    protected queryBlocRoots<E extends HTMLElement = HTMLElement>(id?: string): readonly E[] {
        return Array.from(this.blocRoot.querySelectorAll<E>(`[cms-bloc]`)).filter(
            (element) =>
                (!id || element.getAttribute("cms-bloc") === id) &&
                element.parentElement?.closest(`[cms-bloc]`) === this.blocRoot,
        );
    }

    /** Connect a field label to a nested Bloc without exposing that Bloc's DOM. */
    protected connectBlocFormControl(root: HTMLElement, connection: FormControlConnection): void {
        root.dispatchEvent(
            new CustomEvent<FormControlConnection>(CMS_BLOC_FORM_CONTROL_CONNECT_EVENT, { detail: connection }),
        );
    }

    protected removeAttribute(name: string): void {
        this.blocRoot.removeAttribute(name);
    }

    protected setAttribute(name: string, value: string): void {
        this.blocRoot.setAttribute(name, value);
    }

    protected toggleAttribute(name: string, force?: boolean): boolean {
        return this.blocRoot.toggleAttribute(name, force);
    }

    connectedCallback?(): void;
    disconnectedCallback?(): void;
    attributeChangedCallback?(name: string, oldValue: string | null, newValue: string | null): void;
}

type BehaviorConstructor = {
    new (root: HTMLElement): BlocBehavior;
    readonly observedAttributes?: readonly string[];
};

export function mountBlocBehavior(root: HTMLElement, Controller: BehaviorConstructor): BlocCleanup {
    const connectFormControl = (event: Event): void => {
        if (!(event instanceof CustomEvent) || event.target !== root) {
            return;
        }
        const connection = event.detail as FormControlConnection;
        const control = ownedFormControl(root);
        if (!control) {
            return;
        }
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
    root.addEventListener(CMS_BLOC_FORM_CONTROL_CONNECT_EVENT, connectFormControl);
    const controller = new Controller(root);
    controller.connectedCallback?.();
    root.dispatchEvent(new CustomEvent(CMS_BLOC_FORM_CONTROL_READY_EVENT, { bubbles: true }));
    const names = new Set(Controller.observedAttributes ?? []);
    const observer =
        names.size === 0
            ? null
            : new MutationObserver((records) => {
                  for (const record of records) {
                      const name = record.attributeName;
                      if (name && names.has(name)) {
                          controller.attributeChangedCallback?.(name, record.oldValue, root.getAttribute(name));
                      }
                  }
              });
    observer?.observe(root, { attributes: true, attributeOldValue: true, attributeFilter: [...names] });
    return () => {
        observer?.disconnect();
        root.removeEventListener(CMS_BLOC_FORM_CONTROL_CONNECT_EVENT, connectFormControl);
        controller.disconnectedCallback?.();
    };
}

function ownedFormControl(root: HTMLElement): HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement | null {
    const candidates = root.matches(FORM_CONTROL_SELECTOR)
        ? [root]
        : Array.from(root.querySelectorAll<HTMLElement>(FORM_CONTROL_SELECTOR));
    return (
        (candidates.find((element) => element.closest("[cms-bloc]") === root) as
            | HTMLInputElement
            | HTMLSelectElement
            | HTMLTextAreaElement
            | undefined) ?? null
    );
}
