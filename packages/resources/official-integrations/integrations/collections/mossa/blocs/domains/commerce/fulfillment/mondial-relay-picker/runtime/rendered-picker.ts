export class RenderedPicker extends HTMLElement {
    render() {
        this.root.innerHTML = `
            <style>
                :host {
                    --_mossa-relay-accent: var(--ulvia-primary-base);
                    --_mossa-relay-accent-text: var(--ulvia-primary-contrasted);
                    --_mossa-relay-background: var(--ulvia-surface-background);
                    --_mossa-relay-border: var(--ulvia-surface-border);
                    --_mossa-relay-text: var(--ulvia-body-text);
                    display: block;
                    color: var(--_mossa-relay-text);
                    font: inherit;
                }

                * { box-sizing: border-box; }

                .shell {
                    display: grid;
                    gap: 1rem;
                    padding: clamp(1rem, 3vw, 1.5rem);
                    border: 1px solid var(--_mossa-relay-border);
                    border-radius: var(--ulvia-radius-card);
                    background: var(--_mossa-relay-background);
                    box-shadow: var(--ulvia-shadow-soft);
                }

                :host([appearance="embedded"]) .shell {
                    padding: 0;
                    border: 0;
                    border-radius: 0;
                    background: transparent;
                    box-shadow: none;
                }

                :host([appearance="embedded"]) .header { display: none; }

                .header,
                label,
                .list,
                .option-copy,
                .selected-copy {
                    display: grid;
                }

                .header { gap: .4rem; }
                h2, p { margin: 0; }
                h2 { font-size: 1.25rem; line-height: 1.2; }
                .muted, .address, .status { color: color-mix(in srgb, var(--_mossa-relay-text) 68%, transparent); }

                form {
                    display: grid;
                    grid-template-columns: minmax(8rem, .7fr) minmax(10rem, 1fr) auto;
                    gap: .75rem;
                    align-items: end;
                }

                label { gap: .35rem; font-size: .925rem; font-weight: 700; }

                input,
                button {
                    min-height: 2.65rem;
                    border-radius: var(--ulvia-radius-control);
                    font: inherit;
                }

                input {
                    width: 100%;
                    padding: .6rem .75rem;
                    border: 1px solid var(--_mossa-relay-border);
                    color: var(--_mossa-relay-text);
                    background: var(--_mossa-relay-background);
                }

                button {
                    padding: .6rem .9rem;
                    border: 1px solid var(--_mossa-relay-accent);
                    color: var(--_mossa-relay-accent-text);
                    background: var(--_mossa-relay-accent);
                    cursor: pointer;
                    font-weight: 750;
                }

                button.secondary {
                    color: var(--_mossa-relay-accent);
                    background: transparent;
                }

                button.secondary:hover,
                button.option:hover {
                    background: color-mix(in srgb, var(--_mossa-relay-accent) 7%, var(--_mossa-relay-background));
                }

                input:focus-visible,
                button:focus-visible {
                    outline: 2px solid var(--_mossa-relay-accent);
                    outline-offset: 2px;
                }

                button:disabled,
                input:disabled { cursor: wait; opacity: .65; }

                .list { gap: .65rem; }

                .option,
                .selected {
                    display: grid;
                    grid-template-columns: 1fr auto;
                    gap: .75rem;
                    align-items: center;
                    width: 100%;
                    padding: .85rem;
                    border: 1px solid var(--_mossa-relay-border);
                    border-radius: var(--ulvia-radius-card);
                    color: var(--_mossa-relay-text);
                    background: var(--_mossa-relay-background);
                    text-align: start;
                }

                .option:hover { border-color: var(--_mossa-relay-accent); }
                .option-copy, .selected-copy { gap: .2rem; }
                .option .choose {
                    padding: .4rem .65rem;
                    border: 1px solid var(--_mossa-relay-accent);
                    border-radius: var(--ulvia-radius-control);
                    color: var(--_mossa-relay-accent);
                    background: transparent;
                    font-weight: 750;
                }
                .selected { border-color: var(--_mossa-relay-accent); }
                .selected[hidden], [hidden] { display: none !important; }
                .status { min-height: 1.25rem; font-size: .925rem; }
                .status:empty { display: none; }
                .status[data-state="error"] { color: var(--ulvia-danger-base); }
                .status[data-state="success"] { color: var(--ulvia-success-base); }

                @media (max-width: 42rem) {
                    form { grid-template-columns: 1fr; }
                    form button { width: 100%; }
                    .option, .selected { grid-template-columns: 1fr; }
                }
            </style>
            <section class="shell">
                <div class="header">
                    <h2 data-title></h2>
                    <p class="muted" data-copy></p>
                </div>
                <form novalidate>
                    <label>
                        <span>Postal code</span>
                        <input name="postalCode" inputmode="numeric" autocomplete="postal-code" required>
                    </label>
                    <label>
                        <span>City</span>
                        <input name="city" autocomplete="address-level2">
                    </label>
                    <button type="submit" data-search></button>
                </form>
                <div class="selected" data-selected hidden>
                    <div class="selected-copy">
                        <strong data-selected-name></strong>
                        <span class="address" data-selected-address></span>
                    </div>
                    <button type="button" class="secondary" data-clear>Change</button>
                </div>
                <div class="list" data-list role="list"></div>
                <p class="status" data-status aria-live="polite"></p>
            </section>
        `;
    }
}
