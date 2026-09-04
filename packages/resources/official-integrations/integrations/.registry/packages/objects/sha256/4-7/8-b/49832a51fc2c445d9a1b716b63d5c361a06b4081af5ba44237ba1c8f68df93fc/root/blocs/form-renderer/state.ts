import type { FormAnswers, PublishedForm } from "./definition";

export interface DraftState {
    answers: FormAnswers;
    idempotencyKey: string;
    sessionId: string;
    startedAt: string;
    step: number;
}

function uuid(): string {
    if (globalThis.crypto?.randomUUID) {
        return globalThis.crypto.randomUUID();
    }
    return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
        const random = Math.floor(Math.random() * 16);
        const value = character === "x" ? random : (random & 0x3) | 0x8;
        return value.toString(16);
    });
}

export function readDraft(key: string): DraftState {
    try {
        const saved = sessionStorage.getItem(key);
        if (saved) {
            return JSON.parse(saved) as DraftState;
        }
    } catch {
        // Storage is optional in privacy-restricted browsers.
    }
    return { answers: {}, idempotencyKey: uuid(), sessionId: uuid(), startedAt: new Date().toISOString(), step: 0 };
}

export function writeDraft(key: string, draft: DraftState): void {
    try {
        sessionStorage.setItem(key, JSON.stringify(draft));
    } catch {
        // The current session still works when storage is unavailable.
    }
}

export function clearFormDrafts(sourceId: string, form: PublishedForm): void {
    const prefix = `cms.forms:${sourceId}:${form.key}:`;
    try {
        for (let index = sessionStorage.length - 1; index >= 0; index--) {
            const key = sessionStorage.key(index);
            if (key?.startsWith(prefix)) {
                sessionStorage.removeItem(key);
            }
        }
    } catch {
        // Nothing to clear when storage is unavailable.
    }
}
