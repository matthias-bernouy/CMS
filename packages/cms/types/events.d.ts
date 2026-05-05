import type { P9RMode } from "src/socle/constants/p9r-constants";

export interface SwitchModeEvent extends CustomEvent {
    readonly detail: P9RMode;
}

export interface BlocSelected extends CustomEvent {
    readonly detail: {
        tag: string
    };
}


export interface ImageSelected extends CustomEvent {
    readonly detail: {
        src: string,
        alt: string
    };
}

export interface CMSEvent<Data = string> extends CustomEvent {
    readonly detail: Data
}

declare global {

    interface HTMLElementEventMap {
        "p9r-bloc-selected": BlocSelected,
        "p9r-image-selected": ImageSelected
	}


	interface DocumentEventMap {
        "switch-mode": SwitchModeEvent;
    }

}

export {}