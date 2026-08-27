// A ~40-line markdown renderer for content we author ourselves. Handles the
// four things instructions.md actually uses: h2, bold, bullet lists, paragraphs.
// A markdown library would be forty kilobytes for this.

function inline(text, key) {
  // **bold** only. Nothing else is used, so nothing else is supported.
  const parts = text.split(/(\*\*[^*]+\*\*)/g).filter(Boolean);
  return parts.map((p, i) =>
    p.startsWith('**') && p.endsWith('**')
      ? <strong key={`${key}-${i}`}>{p.slice(2, -2)}</strong>
      : <span key={`${key}-${i}`}>{p}</span>
  );
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
