export class RenderedPicker extends HTMLElement {
    render() {
        this.root.innerHTML = `
            <style>
                :host {
                    --relay-accent: var(--primary-base, #16634d);
                    --relay-accent-text: var(--primary-contrasted, #ffffff);
                    --relay-background: var(--bg-surface, #ffffff);
                    --relay-border: var(--border-default, #dfddd4);
                    --relay-text: var(--text-main, #26261f);
                    display: block;
                    color: var(--relay-text);
                    font: inherit;
                }

                * { box-sizing: border-box; }

                .shell {
                    display: grid;
                    gap: 1rem;
                    padding: clamp(1rem, 3vw, 1.5rem);
                    border: 1px solid var(--relay-border);
                    border-radius: var(--radius-card, .75rem);
                    background: var(--relay-background);
                    box-shadow: var(--shadow-soft, 0 2px 10px rgb(18 30 24 / .08));
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
                .muted, .address, .status { color: color-mix(in srgb, var(--relay-text) 68%, transparent); }

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
                    border-radius: var(--radius-control, .375rem);
                    font: inherit;
                }

                input {
                    width: 100%;
                    padding: .6rem .75rem;
                    border: 1px solid var(--relay-border);
                    color: var(--relay-text);
                    background: var(--relay-background);
                }

                button {
                    padding: .6rem .9rem;
                    border: 1px solid var(--relay-accent);
                    color: var(--relay-accent-text);
                    background: var(--relay-accent);
                    cursor: pointer;
                    font-weight: 750;
                }

                button.secondary {
                    color: var(--relay-accent);
                    background: transparent;
                }

                button.secondary:hover,
                button.option:hover {
                    background: color-mix(in srgb, var(--relay-accent) 7%, var(--relay-background));
                }

                input:focus-visible,
                button:focus-visible {
                    outline: 2px solid var(--relay-accent);
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
                    border: 1px solid var(--relay-border);
                    border-radius: var(--radius-card, .5rem);
                    color: var(--relay-text);
                    background: var(--relay-background);
                    text-align: start;
                }

                .option:hover { border-color: var(--relay-accent); }
                .option-copy, .selected-copy { gap: .2rem; }
                .option .choose {
                    padding: .4rem .65rem;
                    border: 1px solid var(--relay-accent);
                    border-radius: var(--radius-control, .375rem);
                    color: var(--relay-accent);
                    background: transparent;
                    font-weight: 750;
                }
                .selected { border-color: var(--relay-accent); }
                .selected[hidden], [hidden] { display: none !important; }
                .status { min-height: 1.25rem; font-size: .925rem; }
                .status:empty { display: none; }
                .status[data-state="error"] { color: var(--danger-base, #c4473d); }
                .status[data-state="success"] { color: var(--success-base, #21865f); }

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
                        <span>Code postal</span>
                        <input name="postalCode" inputmode="numeric" autocomplete="postal-code" required>
                    </label>
                    <label>
                        <span>Ville</span>
                        <input name="city" autocomplete="address-level2">
                    </label>
                    <button type="submit" data-search></button>
                </form>
                <div class="selected" data-selected hidden>
                    <div class="selected-copy">
                        <strong data-selected-name></strong>
                        <span class="address" data-selected-address></span>
                    </div>
                    <button type="button" class="secondary" data-clear>Modifier</button>
                </div>
                <div class="list" data-list role="list"></div>
                <p class="status" data-status aria-live="polite"></p>
            </section>
        `;
    }
}
