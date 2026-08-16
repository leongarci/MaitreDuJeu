import type { Message, MessageRole } from "@/lib/types";

export function isTableRole(role: MessageRole): boolean {
  return role === "gm" || role === "player";
}

export function isOocRole(role: MessageRole): boolean {
  return role === "ooc" || role === "ooc_gm";
}

export function tableMessages(messages: Message[]): Message[] {
  return messages.filter((m) => isTableRole(m.role));
}

export function oocMessages(messages: Message[]): Message[] {
  return messages.filter((m) => isOocRole(m.role));
}
