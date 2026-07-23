import { inlineButton, inlineKeyboard, type InlineKeyboardMarkup } from "../toolkit/index.js";

export const backRow = [inlineButton("Back to menu", "menu:main")];

export function withBack(rows: Parameters<typeof inlineKeyboard>[0]): InlineKeyboardMarkup {
  return inlineKeyboard([...rows, backRow]);
}

export function cancelFlowKeyboard(): InlineKeyboardMarkup {
  return inlineKeyboard([[inlineButton("Cancel", "flow:cancel")], backRow]);
}
