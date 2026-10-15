import type { FormSubmitResult } from "../../../form/types";
import type { MutationRequest } from "../MutationRequest";
import { lockEditing } from "./editingLock";

type Captured = NonNullable<ReturnType<MutationRequest["capture"]>>;

/** One captured submission and its edit lock. */
export class MutationTransaction {
    private constructor(
        private readonly request: MutationRequest,
        private readonly captured: Captured,
        private unlock: (() => void) | null,
    ) {}

    static prepare(element: Element, request: MutationRequest, url: string): MutationTransaction | null {
        const captured = request.capture(url);
        if (!captured) {
            return null;
        }
        const unlock = lockEditing(element, captured.form);
        if (!unlock) {
            return null;
        }
        return new MutationTransaction(request, captured, unlock);
    }

    get locked(): boolean {
        return this.unlock !== null;
    }

    async send(signal: AbortSignal): Promise<FormSubmitResult | null> {
        const result = await this.request.send(this.captured, signal);
        return signal.aborted ? null : result;
    }

    release(): void {
        const unlock = this.unlock;
        this.unlock = null;
        unlock?.();
    }
}
