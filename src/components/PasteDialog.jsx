import { useEffect, useRef, useState } from 'react';
import { suggest } from '../geocode.js';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Modal for adding many addresses at once, one per line. */
export default function PasteDialog({ open, onClose, onAdd, bias }) {
  const ref = useRef(null);
  const [text, setText] = useState('');
  const [progress, setProgress] = useState(null); // {done,total}
  const [missed, setMissed] = useState([]);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  async function addAll() {
    const lines = text
      .split(/\r?\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (!lines.length) return;
    setProgress({ done: 0, total: lines.length });
    const notFound = [];
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      // "Dana: Herzl 12, Haifa" → label "Dana", query "Herzl 12, Haifa"
      const m = /^([^:]{1,40}):\s*(.+)$/.exec(line);
      const label = m ? m[1].trim() : '';
      const q = m ? m[2].trim() : line;
      try {
        const [place] = await suggest(q, { bias, limit: 1 });
        if (place) onAdd(place, label);
        else notFound.push(line);
      } catch {
        notFound.push(line);
      }
      setProgress({ done: i + 1, total: lines.length });
      await sleep(150); // be polite to the shared geocoder
    }
    setProgress(null);
    setMissed(notFound);
    setText(notFound.join('\n'));
    if (!notFound.length) onClose();
  }

  return (
    <dialog ref={ref} onClose={onClose} aria-labelledby="paste-title">
      <h2 id="paste-title">Add a list of addresses</h2>
      <p>
        One address per line. Put a name before a colon to label it, like <em>Dana: Herzl 12, Haifa</em>.
      </p>
      <textarea
        dir="auto"
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder={'Dana: Herzl 12, Haifa\nOffice: Rothschild 1, Tel Aviv\nBen Gurion Airport'}
        disabled={!!progress}
      />
      {missed.length > 0 && !progress && (
        <p className="note warn">
          {missed.length === 1 ? 'One line' : `${missed.length} lines`} couldn’t be matched to a place and stayed in the box. Add a city or
          country and try again.
        </p>
      )}
      <div className="dialog-actions">
        {progress && (
          <span className="progress">
            Looking up {progress.done} of {progress.total}…
          </span>
        )}
        <button type="button" className="secondary-btn" onClick={onClose} disabled={!!progress}>
          Close
        </button>
        <button type="button" className="primary-btn" onClick={addAll} disabled={!!progress || !text.trim()}>
          Add all
        </button>
      </div>
    </dialog>
  );
}
