export const formatError = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  return String(error);
};

export const truncate = (text: string, maxLength = 1200): string => {
  if (text.length <= maxLength) return text;
  return `${text.slice(0, maxLength)}…`;
};

export const textFromAssistantContent = (content: Array<{ type: string; text?: string }>): string => {
  return content
    .filter((item): item is { type: "text"; text: string } => item.type === "text" && typeof item.text === "string")
    .map((item) => item.text)
    .join("\n")
    .trim();
};
