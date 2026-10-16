export type BlocCleanup = () => void;
export type BlocMount = (root: HTMLElement) => void | BlocCleanup;

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
        return this.blocRoot.querySelector<E>(selectors);
    }

    protected querySelectorAll<E extends Element = Element>(selectors: string): NodeListOf<E> {
        return this.blocRoot.querySelectorAll<E>(selectors);
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
    const controller = new Controller(root);
    controller.connectedCallback?.();
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
        controller.disconnectedCallback?.();
    };
}
