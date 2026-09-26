import "server-only";
import { HTML_ENTITIES, HTML_STRIP_MAX_CHARS } from "@/constants/jobParsing";

// ─── String and HTML utilities ───────────────────────────────────────────────
export function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, HTML_STRIP_MAX_CHARS);
}

export function decodeHtmlEntities(value: string): string {
  return value.replace(
    /&(#x[\da-f]+|#\d+|amp|quot|apos|#39|lt|gt|nbsp);/gi,
    (entity, code: string) => {
      if (code[0] === "#") {
        const numeric =
          code[1]?.toLowerCase() === "x"
            ? Number.parseInt(code.slice(2), 16)
            : Number.parseInt(code.slice(1), 10);
        return Number.isInteger(numeric) && numeric >= 0 && numeric <= 0x10ffff
          ? String.fromCodePoint(numeric)
          : entity;
      }
      return HTML_ENTITIES[code.toLowerCase()] ?? entity;
    },
  );
}
