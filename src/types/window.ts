export type WindowType = "app" | "iframe" | "terminal";

export interface WindowInstance {
  id: string;
  title: string;
  type: WindowType;
  component?: string;
  url?: string;
  x: number;
  y: number;
  width: number;
  height: number;
  zIndex: number;
  opacity: number;
  isMinimized: boolean;
  isMaximized: boolean;
  isPinned: boolean;
}

export interface WindowConfig {
  title: string;
  type: WindowType;
  component?: string;
  url?: string;
  x?: number;
  y?: number;
  width?: number;
  height?: number;
}
