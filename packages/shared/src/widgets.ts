// @vibeful/shared — Widget Specification Types
//
// Agents emit widgets via vibeful-command blocks. The SDK renders them.
// Widget interactions are reported back to the agent via widget_event messages.

/** Top-level widget specification — what the agent emits */
export interface WidgetSpec {
  widget_id: string;
  type: WidgetType;
  props: Record<string, unknown>;
  /** Optional layout positioning */
  position?: WidgetPosition;
}

export type WidgetType = 'button' | 'card' | 'form' | 'chart' | 'table' | 'dashboard' | 'custom';

export interface WidgetPosition {
  /** Grid placement: row, column, or standalone */
  layout?: 'row' | 'column' | 'grid' | 'standalone';
  /** Order within a layout group */
  order?: number;
}

// ── Per-widget props ──────────────────────────────────────

export interface ButtonWidgetProps {
  label: string;
  variant?: 'primary' | 'secondary' | 'danger';
  disabled?: boolean;
}

export interface CardWidgetProps {
  title: string;
  content: string;
  /** Optional image URL */
  image_url?: string;
  /** Optional action button */
  action?: { label: string; value: string };
}

export interface FormWidgetProps {
  title?: string;
  fields: FormField[];
  submit_label?: string;
}

export interface FormField {
  key: string;
  label: string;
  type: 'text' | 'number' | 'select' | 'boolean' | 'textarea';
  required?: boolean;
  placeholder?: string;
  options?: Array<{ value: string; label: string }>;
  default_value?: unknown;
}

export interface ChartWidgetProps {
  title?: string;
  chart_type: 'bar' | 'line' | 'pie';
  data: ChartDataPoint[];
}

export interface ChartDataPoint {
  label: string;
  value: number;
}

export interface TableWidgetProps {
  title?: string;
  columns: TableColumn[];
  rows: Array<Record<string, unknown>>;
}

export interface TableColumn {
  key: string;
  label: string;
}

// ── Widget events (reported back to agent) ────────────────

export interface WidgetEvent {
  widget_id: string;
  event_type: 'click' | 'change' | 'submit';
  value?: unknown;
  /** Form field values on submit */
  form_data?: Record<string, unknown>;
}

/** Template for saved widget configurations in the console */
export interface WidgetTemplate {
  id: string;
  name: string;
  description?: string;
  widgets: WidgetSpec[];
  created_at: string;
  updated_at: string;
}