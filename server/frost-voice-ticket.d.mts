export interface SpeechTicket { h: string; exp: number; id: string }
export function answerSpeechTicket(task: string, content: string, now?: number): { speechTicket?: string };
export function readSpeechTicket(token: string, now?: number): SpeechTicket | null;
export function speechTicketMatches(ticket: SpeechTicket | null, text: string): boolean;
