export interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: number;
  streaming?: boolean;
  /** Terminal failure copy — renders the retry affordance under the bubble. */
  error?: boolean;
}
