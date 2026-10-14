/** Coalesces change-triggered submissions while one mutation owns the form. */
export class ChangeMutationScheduler {
    private pending = false;

    constructor(
        private readonly form: HTMLFormElement,
        private readonly locked: () => boolean,
        private readonly submit: () => Promise<boolean>,
    ) {}

    run(): void {
        if (!this.form.reportValidity() || !this.form.isConnected) {
            return;
        }
        if (this.locked()) {
            this.pending = true;
            return;
        }
        void this.submit().finally(() => {
            this.release();
        });
    }

    release(): void {
        if (this.pending && !this.locked()) {
            this.pending = false;
            this.run();
        }
    }
}
