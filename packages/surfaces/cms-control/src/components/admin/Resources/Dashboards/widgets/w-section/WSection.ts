import { CmsDetailSection } from "cms-control/components/admin/Layout/ShellDetail/DetailSection";

export class DashboardWSection extends CmsDetailSection {}

if (!customElements.get("cms-dashboard-w-section")) {
    customElements.define("cms-dashboard-w-section", DashboardWSection);
}
