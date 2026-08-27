export type RelayBlock = {
  id: string;
  type: "heading" | "text" | "button" | "divider" | "spacer";
  content?: string;
  href?: string;
};

export type RelayTemplateSchema = { blocks: RelayBlock[] };

const VARIABLE = /{{\s*([a-zA-Z0-9_.]+)\s*}}/g;

export function relayVariableKeys(input: string) {
  return [...new Set([...input.matchAll(VARIABLE)].map((match) => match[1]))];
}

export function resolveRelayVariables(input: string, values: Record<string,string>) {
  const missing = new Set<string>();
  const value = input.replace(VARIABLE, (_, key: string) => {
    if (!(key in values)) { missing.add(key); return `{{${key}}}`; }
    return values[key];
  });
  return { value, missing: [...missing] };
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (char) => ({
    "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"
  })[char] ?? char);
}

export function renderRelayTemplate(schema: RelayTemplateSchema, values: Record<string,string> = {}) {
  const missing = new Set<string>();
  const resolve = (value = "") => {
    const result = resolveRelayVariables(value, values);
    result.missing.forEach((key) => missing.add(key));
    return result.value;
  };
  const parts = schema.blocks.map((block) => {
    const content = escapeHtml(resolve(block.content));
    if (block.type === "heading") return `<h2 style="margin:0 0 16px;font-family:Arial,sans-serif;font-size:28px;line-height:1.2;color:#111827">${content}</h2>`;
    if (block.type === "text") return `<p style="margin:0 0 16px;font-family:Arial,sans-serif;font-size:16px;line-height:1.6;color:#374151">${content.replace(/\n/g,"<br>")}</p>`;
    if (block.type === "button") {
      const href = escapeHtml(resolve(block.href || "#"));
      return `<p style="margin:20px 0"><a href="${href}" style="display:inline-block;padding:12px 18px;background:#111827;color:#fff;text-decoration:none;border-radius:8px;font-family:Arial,sans-serif;font-weight:700">${content || "Continue"}</a></p>`;
    }
    if (block.type === "divider") return '<hr style="border:0;border-top:1px solid #e5e7eb;margin:24px 0">';
    if (block.type === "spacer") return '<div style="height:24px;line-height:24px">&nbsp;</div>';
    return "";
  });
  const html = `<!doctype html><html><body style="margin:0;background:#f3f4f6"><table role="presentation" width="100%" cellspacing="0" cellpadding="0"><tr><td align="center" style="padding:24px"><table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:640px;background:#fff"><tr><td style="padding:32px">${parts.join("")}</td></tr></table></td></tr></table></body></html>`;
  const text = schema.blocks.filter((b)=>["heading","text","button"].includes(b.type)).map((b)=>resolve(b.content)).filter(Boolean).join("\n\n");
  return { html, text, missingVariables:[...missing] };
}