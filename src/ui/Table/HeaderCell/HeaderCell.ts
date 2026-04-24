export class TableHeaderCell extends HTMLElement {
    static get observedAttributes() {
        return ['sort', 'direction', 'active', 'filter-name', 'filter-type'];
    }

    constructor() {
        super();
        this.attachShadow({ mode: 'open' });
    }

    connectedCallback() {
        // Listen for click to handle sorting
        this.addEventListener('click', this.handleSort);
        this.render();
    }

    private handleSort = (e: Event) => {
        // Skip sorting if the filter input was clicked
        if (e.composedPath().some(el => el instanceof HTMLInputElement)) return;

        const sortKey = this.getAttribute('sort');
        if (!sortKey) return;

        const url = new URL(window.location.href);
        const currentSort = url.searchParams.get('sort');
        const currentDir = url.searchParams.get('direction');

        const newDir = (currentSort === sortKey && currentDir === 'asc') ? 'desc' : 'asc';

        url.searchParams.set('sort', sortKey);
        url.searchParams.set('direction', newDir);
        window.location.href = url.toString();
    }


    render() {
        const filterName = this.getAttribute('filter-name');
        const url = new URL(window.location.href);
        const currentFilterValue = url.searchParams.get(`f_${filterName}`) || '';
        const hasFilter = currentFilterValue.length > 0;

        if (this.shadowRoot) {
            this.shadowRoot.innerHTML = `
            <style>
                :host {
                    display: table-cell;
                    padding: 12px 20px;
                    border-bottom: 2px solid var(--border-light);
                    position: relative; /* For popover positioning */
                }
                .header-wrapper {
                    display: flex;
                    align-items: center;
                    justify-content: space-between;
                }
                .label-section {
                    cursor: pointer;
                    display: flex;
                    align-items: center;
                    gap: 5px;
                }
                .filter-trigger {
                    cursor: pointer;
                    padding: 4px;
                    border-radius: 4px;
                    transition: background 0.2s;
                    color: ${hasFilter ? 'var(--primary-base, #007bff)' : '#ccc'};
                }
                .filter-trigger:hover { background: #eee; }

                /* Filter popover */
                .filter-popover {
                    display: none;
                    position: absolute;
                    top: 100%;
                    left: 0;
                    z-index: 10;
                    background: white;
                    border: 1px solid #ddd;
                    box-shadow: 0 4px 12px rgba(0,0,0,0.1);
                    padding: 10px;
                    border-radius: 6px;
                    min-width: 150px;
                }
                .filter-popover.open { display: block; }
                
                input {
                    width: 100%;
                    padding: 6px;
                    border: 1px solid #ddd;
                    border-radius: 4px;
                    font-size: 13px;
                }
            </style>
            
            <div class="header-wrapper">
                <div class="label-section" id="sort-trigger">
                    <slot></slot>
                    <span class="sort-icon">...</span>
                </div>

                ${filterName ? `
                    <div class="filter-trigger" id="filter-btn">
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3"></polygon>
                        </svg>
                    </div>
                    <div class="filter-popover" id="filter-popover">
                        <input type="text" placeholder="Filter..." value="${currentFilterValue}" id="filter-input">
                    </div>
                ` : ''}
            </div>
        `;

            this.setupEvents();
        }
    }

    private setupEvents() {
        const filterBtn = this.shadowRoot?.querySelector('#filter-btn');
        const popover = this.shadowRoot?.querySelector('#filter-popover');
        const input = this.shadowRoot?.querySelector('#filter-input') as HTMLInputElement;
        const sortTrigger = this.shadowRoot?.querySelector('#sort-trigger');

        // Toggle filter popover
        filterBtn?.addEventListener('click', (e) => {
            e.stopPropagation();
            popover?.classList.toggle('open');
            if (popover?.classList.contains('open')) input?.focus();
        });

        // Close when clicking outside
        window.addEventListener('click', () => popover?.classList.remove('open'));
        popover?.addEventListener('click', (e) => e.stopPropagation());

        // Sort (only on label click)
        sortTrigger?.addEventListener('click', (e) => this.handleSort(e));

        // Apply filter on Enter
        input?.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                this.applyFilter(input.value);
            }
        });
    }

    private applyFilter(value: string) {
        const filterName = this.getAttribute('filter-name');
        const url = new URL(window.location.href);

        if (value) url.searchParams.set(`f_${filterName}`, value);
        else url.searchParams.delete(`f_${filterName}`);

        window.location.href = url.toString();
    }
}

customElements.define("p9r-header-cell", TableHeaderCell);