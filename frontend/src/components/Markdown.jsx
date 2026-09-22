// A ~40-line markdown renderer for content we author ourselves. Handles the
// five things instructions.md actually uses: h2, bold, links, bullet lists,
// paragraphs. NOT h3 (`###` renders as literal text), NOT nested or
// hard-wrapped bullets — a bullet must be one line — and NOT a link inside
// **bold**: the bold span is matched first and its contents render as plain text.
// A markdown library would be forty kilobytes for this.

// [text](https://…) — http(s) ONLY, by grammar rather than by a check: the
// pattern cannot match a `javascript:` or `data:` URL, so one written into the
// file stays inert literal text instead of becoming a live href.
const LINK = /\[([^\]]+)\]\((https?:\/\/[^)\s]+)\)/;

function inline(text, key) {
  const parts = text.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\(https?:\/\/[^)\s]+\))/g).filter(Boolean);
  return parts.map((p, i) => {
    const k = `${key}-${i}`;
    if (p.startsWith('**') && p.endsWith('**')) return <strong key={k}>{p.slice(2, -2)}</strong>;
    const m = p.match(LINK);
    if (m) {
      // Off-site, so a new tab: the candidate is mid-way through reading the
      // brief and should not lose their place in it.
      return <a key={k} className="ext-link" href={m[2]} target="_blank" rel="noopener noreferrer">{m[1]}</a>;
    }
    return <span key={k}>{p}</span>;
  });
}

export function parseSections(md) {
  // Split on "## " headings into { title, body } sections.
  const out = [];
  let current = null;
  for (const line of (md || '').split('\n')) {
    const h = line.match(/^##\s+(.*)$/);
    if (h) {
      if (current) out.push(current);
      current = { title: h[1].trim(), lines: [] };
    } else if (current) {
      current.lines.push(line);
    } else if (line.trim()) {
      current = { title: null, lines: [line] };
    }
  }
  if (current) out.push(current);
  return out;
}

export default function Markdown({ lines }) {
  const blocks = [];
  let list = null;
  let para = null;

  const flushList = () => {
    if (list) { blocks.push({ type: 'ul', items: list }); list = null; }
  };
  // Consecutive non-blank lines are ONE paragraph. Markdown hard-wraps inside a
  // paragraph; treating each source line as its own <p> put a gap mid-sentence.
  const flushPara = () => {
    if (para) { blocks.push({ type: 'p', text: para.join(' ') }); para = null; }
  };

  for (const raw of lines) {
    const line = raw.trim();
    if (!line) { flushList(); flushPara(); continue; }
    if (line.startsWith('- ')) {
      flushPara();
      (list ||= []).push(line.slice(2));
    } else {
      flushList();
      (para ||= []).push(line);
    }
  }
  flushList();
  flushPara();

  return (
    <>
      {blocks.map((b, i) =>
        b.type === 'ul' ? (
          <ul key={i}>{b.items.map((it, j) => <li key={j}>{inline(it, `${i}-${j}`)}</li>)}</ul>
        ) : (
          <p key={i}>{inline(b.text, String(i))}</p>
        )
      )}
    </>
  );
}
