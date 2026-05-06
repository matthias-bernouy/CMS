# AI Agent Guidelines: Component Development

## 1. Asset Management: Images Over Web Fonts
* **Guideline:** Strictly avoid using HTML icon fonts (e.g., FontAwesome)[cite: 1]. 
* **Action:** Use image formats (**SVG**, **PNG**, **JPEG**) for all icons and graphic assets[cite: 1].
* **Reasoning:** Images offer better scalability, easier styling, and can be performance-optimized (compression, lazy-loading) more effectively than font files[cite: 1].

## 2. Performance: Pre-compute Logic
* **Guideline:** Offload complex calculations (positions, dimensions, data mapping) to the **editor side** rather than the client-side[cite: 1].
* **Reasoning:** Passing pre-computed values via attributes or properties reduces the JavaScript execution load on the user's browser, ensuring a smoother experience[cite: 1].

## 3. Styling: CSS-First Architecture
* **Guideline:** Prioritize **native CSS** (Flexbox, Grid, etc.) for layout and styling over JavaScript-based logic[cite: 1].
* **Reasoning:** CSS is hardware-accelerated and highly optimized by browsers. Only use JS for styling when CSS limitations are strictly reached[cite: 1].

## 4. Editor Integrity: Synchronized Components
* **Guideline:** The `<p9r-comp-sync>` tag in `configuration.html` **must always** contain at least one child element.
* **Constraint:** Never use an empty `<p9r-comp-sync></p9r-comp-sync>` tag.
* **Reasoning:** Empty tags for this specific component cause critical bugs within the editor environment.

## 5. Theme System & Global Variables
* **Guideline:** Components **must** use the following standardized global variables for visual consistency[cite: 1].
* **Custom Styles:** If a component requires a specific style not covered by the theme, it must be made **configurable** via the component's configuration (attributes or editor settings)[cite: 1]. Never hardcode values that should be user-adjustable[cite: 1].

### Available Theme Variables Reference

| Category | Variable Names |
| :--- | :--- |
| **Surfaces** | `--bg-base`, `--bg-surface`, `--bg-overlay`[cite: 1] |
| **Text** | `--text-main`, `--text-body`, `--text-muted`, `--text-label`[cite: 1] |
| **Borders** | `--border-default`, `--border-light`[cite: 1] |
| **Primary** | `--primary-base`, `--primary-muted`, `--primary-contrasted`, `--color-primary`[cite: 1] |
| **Secondary** | `--secondary-base`, `--secondary-muted`, `--secondary-contrasted`[cite: 1] |
| **Status (Danger)** | `--danger-base`, `--danger-muted`, `--danger-contrasted`[cite: 1] |
| **Status (Success)** | `--success-base`, `--success-muted`, `--success-contrasted`[cite: 1] |
| **Status (Info)** | `--info-base`, `--info-muted`, `--info-contrasted`[cite: 1] |
| **Status (Warning)** | `--warning-base`, `--warning-muted`, `--warning-contrasted`[cite: 1] |