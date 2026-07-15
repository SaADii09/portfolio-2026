export type WidgetType = "cpu" | "weather" | "music" | "notes";

export interface WidgetInstance {
  id: string;
  type: WidgetType;
  title: string;
  x: number;
  y: number;
  width: number;
  height: number;
  isPinned: boolean;
  isCollapsed: boolean;
  data?: Record<string, unknown>;
}
