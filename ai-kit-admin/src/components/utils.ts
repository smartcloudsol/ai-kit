import {
  marked,
  type TokensList,
  type MarkedOptions,
  type Tokens,
} from "marked";

const MD_OPTS: MarkedOptions<string, string> = {
  async: false,
  gfm: true,
  breaks: false,
};

function wrap(
  blockName: string,
  attrs?: Record<string, unknown> | null,
  innerHtml: string = "",
  selfClosing: boolean = false
): string {
  const attrsJson =
    attrs && Object.keys(attrs).length ? ` ${JSON.stringify(attrs)}` : "";
  if (selfClosing)
    return `<!-- wp:${blockName}${attrsJson} /-->
`;
  return `<!-- wp:${blockName}${attrsJson} -->
${innerHtml}
<!-- /wp:${blockName} -->
`;
}

function escapeHtml(str: string = ""): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function inline(md: string = ""): string {
  return marked.parseInline(md ?? "", MD_OPTS) as string;
}

function renderList(listToken: Tokens.List): string {
  const ordered: boolean = listToken.ordered;
  const items: Tokens.ListItem[] = listToken.items;
  const startVal = listToken.start;
  const startAttr =
    ordered && typeof startVal === "number" && startVal !== 1
      ? ` start="${startVal}"`
      : "";
  const tag = ordered ? "ol" : "ul";

  const inner = items
    .map((item) => {
      const itemHtml: string[] = [];
      if (item.text) {
        itemHtml.push(`<p>${inline(item.text)}</p>`);
      }
      if (Array.isArray(item.tokens)) {
        item.tokens.forEach((tok) => {
          switch (tok.type) {
            case "paragraph": {
              const para = tok as Tokens.Paragraph;
              itemHtml.push(`<p>${inline(para.text || "")}</p>`);
              break;
            }
            case "list": {
              const nested = renderList(tok as Tokens.List)
                .replace(/^<!-- wp:list[^]*?-->/, "")
                .replace(/<!-- \/wp:list -->\n?$/, "");
              itemHtml.push(nested);
              break;
            }
            case "code": {
              const codeTok = tok as Tokens.Code;
              const code = escapeHtml(codeTok.text || "");
              const lang = codeTok.lang
                ? ` class="language-${escapeHtml(codeTok.lang)}"`
                : "";
              itemHtml.push(`<pre><code${lang}>${code}</code></pre>`);
              break;
            }
            case "blockquote": {
              const q = tok as Tokens.Blockquote;
              const qInner = (q.tokens || [])
                .map((t) =>
                  t.type === "paragraph"
                    ? `<p>${inline((t as Tokens.Paragraph).text || "")}</p>`
                    : ""
                )
                .join("");
              itemHtml.push(`<blockquote><p>${qInner}</p></blockquote>`);
              break;
            }
            default:
              // ignore other inline token types in list items here
              break;
          }
        });
      }
      const joined = itemHtml.join("");
      return `<li>${joined || inline(item.raw || "")}</li>`;
    })
    .join("");

  return wrap("list", { ordered }, `<${tag}${startAttr}>${inner}</${tag}>`);
}

export function mdToGutenberg(markdown: string): string {
  const tokens: TokensList = marked.lexer(
    markdown || "",
    MD_OPTS
  ) as TokensList;
  const out: string[] = [];

  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];

    switch (t.type) {
      case "heading": {
        const h = t as Tokens.Heading;
        const level = Math.min(Math.max(h.depth || 1, 1), 6);
        out.push(
          wrap(
            "heading",
            { level },
            `<h${level}>${inline(h.text || "")}</h${level}>`
          )
        );
        break;
      }
      case "paragraph": {
        const p = t as Tokens.Paragraph;
        out.push(wrap("paragraph", null, `<p>${inline(p.text || "")}</p>`));
        break;
      }
      case "text": {
        const txt = t as Tokens.Text;
        out.push(wrap("paragraph", null, `<p>${inline(txt.text || "")}</p>`));
        break;
      }
      case "blockquote": {
        const bq = t as Tokens.Blockquote;
        const inner = (bq.tokens || [])
          .map((bt) =>
            bt.type === "paragraph"
              ? `<p>${inline((bt as Tokens.Paragraph).text || "")}</p>`
              : ""
          )
          .join("");
        out.push(
          wrap(
            "quote",
            null,
            `<blockquote class="wp-block-quote">${inner}</blockquote>`
          )
        );
        break;
      }
      case "list": {
        out.push(renderList(t as Tokens.List));
        break;
      }
      case "image": {
        const img = t as Tokens.Image;
        out.push(
          wrap(
            "image",
            {
              url: img.href || (img as unknown as { url?: string }).url || "",
              alt: img.text || img.title || "",
            },
            "",
            true
          )
        );
        break;
      }
      case "hr": {
        out.push(wrap("separator", null, `<hr class="wp-block-separator"/>`));
        break;
      }
      case "code": {
        const c = t as Tokens.Code;
        const code = escapeHtml(c.text || "");
        const lang = c.lang ? ` class="language-${escapeHtml(c.lang)}"` : "";
        const pre = `<pre class="wp-block-code"><code${lang}>${code}</code></pre>`;
        out.push(wrap("code", null, pre));
        break;
      }
      case "table": {
        const tbl = t as Tokens.Table;
        const head = `<thead><tr>${tbl.header
          .map((c) => `<th>${inline(c.text || "")}</th>`)
          .join("")}</tr></thead>`;
        const body = `<tbody>${tbl.rows
          .map(
            (row) =>
              `<tr>${row
                .map((c) => `<td>${inline(c.text || "")}</td>`)
                .join("")}</tr>`
          )
          .join("")}</tbody>`;
        out.push(
          wrap(
            "table",
            null,
            `<figure class="wp-block-table"><table>${head}${body}</table></figure>`
          )
        );
        break;
      }
      case "space": {
        // ignore spacing
        break;
      }
      default: {
        // exhaustive check: if new token types appear, handle them here
        const _never: never = t as never; // forces compile-time check if union widens
        void _never; // no-op
        if ((t as { raw?: string }).raw) {
          out.push(
            wrap(
              "paragraph",
              null,
              `<p>${inline((t as { raw?: string }).raw as string)}</p>`
            )
          );
        }
      }
    }
  }

  return out.join("\n");
}
