export interface NavigateOptions {
  waitUntil?: 'load' | 'domcontentloaded' | 'networkidle';
  timeoutMs?: number;
}

export interface ClickOptions {
  button?: 'left' | 'middle' | 'right';
  clickCount?: number;
  delayMs?: number;
}

export interface TypeOptions {
  delayMs?: number;
  pressEnter?: boolean;
}

export interface WaitForOptions {
  selector?: string;
  text?: string;
  timeoutMs?: number;
  state?: 'attached' | 'detached' | 'visible' | 'hidden';
}

export interface ScreenshotOptions {
  label?: string;
  fullPage?: boolean;
  path?: string;
}

export interface SnapshotOptions {
  label?: string;
  includeDom?: boolean;
  persist?: boolean;
}

export interface PageSnapshot {
  url: string;
  title: string;
  timestamp: string;
  dom?: string;
  accessibilityTree?: any;
}

export interface PlanDefinition {
  name: string;
  description?: string;
  startUrl: string;
  steps: Array<PlanStep>;
}

export type PlanStep =
  | { id: string; kind: 'navigate'; url: string; options?: NavigateOptions }
  | { id: string; kind: 'waitFor'; options: WaitForOptions }
  | { id: string; kind: 'click'; selector: string; options?: ClickOptions }
  | { id: string; kind: 'type'; selector: string; value: string; options?: TypeOptions }
  | { id: string; kind: 'evaluate'; script: string }
  | { id: string; kind: 'snapshot'; options?: SnapshotOptions }
  | { id: string; kind: 'screenshot'; options?: ScreenshotOptions };

export interface PlanResult {
  stepId: string;
  status: 'success' | 'error';
  error?: string;
  artifacts?: string[];
}
