import { createActionDispatcher, type ActionDeps } from './actionDispatcher';
import { createKeyDownHandler, type KeyboardDeps } from './keyboardHandler';
import { createPointerHandlers, type PointerDeps, type PointerHandlers } from './pointerHandlers';

export type EventManagerDeps = KeyboardDeps & PointerDeps & ActionDeps & {
    hoverEl: () => HTMLElement | null;
};

/**
 * Owns every DOM listener BAG attaches while open: keyboard, action-click,
 * mouseleave/mousemove on the host + hover anchor, and click-outside on
 * `window`. Centralizes the bind/unbind pair so an open() call can never
 * leave a dangling listener after close().
 */
export class EventManager {

    private _attached = false;
    private _onKeyDown: (e: KeyboardEvent) => void;
    private _onActionClick: (e: CustomEvent) => void;
    private _pointer: PointerHandlers;

    constructor(private deps: EventManagerDeps) {
        this._onKeyDown = createKeyDownHandler(deps);
        this._onActionClick = createActionDispatcher(deps);
        this._pointer = createPointerHandlers(deps);
    }

    attach() {
        if (this._attached) return;
        this.deps.host.addEventListener('action-click' as any, this._onActionClick);
        this.deps.host.addEventListener('mouseleave', this._pointer.onLeave);
        this.deps.hoverEl()?.addEventListener('mouseleave', this._pointer.onLeave);
        this.deps.hoverEl()?.addEventListener('mousemove', this._pointer.onMouseMove);
        window.addEventListener('keydown', this._onKeyDown);
        window.addEventListener('click', this._pointer.onClickOutside);
        this._attached = true;
    }

    detach() {
        if (!this._attached) return;
        this.deps.host.removeEventListener('action-click' as any, this._onActionClick);
        this.deps.host.removeEventListener('mouseleave', this._pointer.onLeave);
        this.deps.hoverEl()?.removeEventListener('mouseleave', this._pointer.onLeave);
        this.deps.hoverEl()?.removeEventListener('mousemove', this._pointer.onMouseMove);
        window.removeEventListener('keydown', this._onKeyDown);
        window.removeEventListener('click', this._pointer.onClickOutside);
        this._pointer.cancelPendingReflow();
        this._attached = false;
    }

    /** Last position recorded by the mousemove handler — used by reflow code
     *  to keep the BAG anchored under the cursor between `mouseenter` events. */
    lastMouse() {
        return this._pointer.lastMouse();
    }

    /** Re-bind hover-related listeners against a new anchor (called by
     *  `setEditor` when the active editor changes mid-session). */
    rebindHover(prev: HTMLElement | null) {
        if (!this._attached) return;
        prev?.removeEventListener('mouseleave', this._pointer.onLeave);
        prev?.removeEventListener('mousemove', this._pointer.onMouseMove);
        const next = this.deps.hoverEl();
        next?.addEventListener('mouseleave', this._pointer.onLeave);
        next?.addEventListener('mousemove', this._pointer.onMouseMove);
    }
}
