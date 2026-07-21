// A deliberately small markdown renderer for SCENA's own docs — it handles
// exactly the constructs the guides use (headings, fenced code, lists,
// tables, inline code/bold/italic/links) and nothing more.

function escapeHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function slug(text: string): string {
  return text
    .toLowerCase()
    .replace(/`/g, '')
    .replace(/[^a-z0-9\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-');
}

function inline(s: string): string {
  return escapeHtml(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,;:]|$)/g, '$1<em>$2</em>')
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_m, text: string, href: string) => {
      const page = href.match(/^\.\/([\w-]+)\.md$/);
      if (page) href = `guide.html?page=${page[1]}`;
      const external = /^https?:/.test(href) ? ' target="_blank" rel="noreferrer"' : '';
      return `<a href="${href}"${external}>${text}</a>`;
    });
}

export interface Heading {
  level: number;
  text: string;
  id: string;
}

export function renderMarkdown(md: string): { html: string; headings: Heading[] } {
  const out: string[] = [];
  const headings: Heading[] = [];
  let para: string[] = [];
  let list: { tag: 'ul' | 'ol'; items: string[] } | null = null;
  let fence: string[] | null = null;
  let table: string[][] | null = null;

  const flushPara = () => {
    if (para.length) out.push(`<p>${inline(para.join(' '))}</p>`);
    para = [];
  };
  const flushList = () => {
    if (list) {
      out.push(`<${list.tag}>${list.items.map((i) => `<li>${i}</li>`).join('')}</${list.tag}>`);
    }
    list = null;
  };
  const flushTable = () => {
    if (table && table.length) {
      const [head, ...rows] = table;
      out.push(
        '<table><thead><tr>' +
          head.map((c) => `<th>${inline(c)}</th>`).join('') +
          '</tr></thead><tbody>' +
          rows.map((r) => `<tr>${r.map((c) => `<td>${inline(c)}</td>`).join('')}</tr>`).join('') +
          '</tbody></table>'
      );
    }
    table = null;
  };
  const flushAll = () => {
    flushPara();
    flushList();
    flushTable();
  };

  for (const line of md.split('\n')) {
    if (fence) {
      if (/^\s*```/.test(line)) {
        out.push(`<pre><code>${escapeHtml(fence.join('\n'))}</code></pre>`);
        fence = null;
      } else {
        fence.push(line);
      }
      continue;
    }
    const fenceOpen = line.match(/^\s*```/);
    if (fenceOpen) {
      flushAll();
      fence = [];
      continue;
    }
    const heading = line.match(/^(#{1,4})\s+(.*)$/);
    if (heading) {
      flushAll();
      const level = heading[1].length;
      const id = slug(heading[2]);
      headings.push({ level, text: heading[2].replace(/`/g, ''), id });
      out.push(`<h${level} id="${id}">${inline(heading[2])}</h${level}>`);
      continue;
    }
    if (/^\s*\|/.test(line)) {
      flushPara();
      flushList();
      if (/^[\s|:-]+$/.test(line)) continue; // header separator row
      table = table ?? [];
      table.push(
        line
          .trim()
          .replace(/^\||\|$/g, '')
          .split('|')
          .map((c) => c.trim())
      );
      continue;
    }
    const bullet = line.match(/^\s*[-*]\s+(.*)$/);
    if (bullet) {
      flushPara();
      flushTable();
      if (!list || list.tag !== 'ul') {
        flushList();
        list = { tag: 'ul', items: [] };
      }
      list.items.push(inline(bullet[1]));
      continue;
    }
    const ordered = line.match(/^\s*\d+\.\s+(.*)$/);
    if (ordered) {
      flushPara();
      flushTable();
      if (!list || list.tag !== 'ol') {
        flushList();
        list = { tag: 'ol', items: [] };
      }
      list.items.push(inline(ordered[1]));
      continue;
    }
    if (line.trim() === '') {
      flushAll();
      continue;
    }
    // Continuation of a wrapped list item, or a paragraph line.
    if (list && /^\s{2,}/.test(line)) {
      list.items[list.items.length - 1] += ' ' + inline(line.trim());
    } else {
      flushList();
      flushTable();
      para.push(line.trim());
    }
  }
  flushAll();
  return { html: out.join('\n'), headings };
}
