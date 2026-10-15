import { useEffect, useId, useRef, useState } from 'react';
import { suggest } from '../geocode.js';
import { Search } from '../icons.jsx';

/**
 * Type-ahead address box. Calls `onPick(place)` with {address, lat, lng,...}
 * when the user chooses a suggestion. `bias` ({lat,lng}) prefers nearby results.
 */
export default function AddressSearch({ onPick, bias, placeholder = 'Add an address', initialQuery = '', autoFocus = false }) {
  const [query, setQuery] = useState(initialQuery);
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [status, setStatus] = useState('idle'); // idle | loading | ok | empty | error
  const listId = useId();
  const wrapRef = useRef(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 3) {
      setItems([]);
      setStatus('idle');
      setOpen(false);
      return undefined;
    }
    const ctl = new AbortController();
    const timer = setTimeout(async () => {
      setStatus('loading');
      try {
        const found = await suggest(q, { signal: ctl.signal, bias });
        setItems(found);
        setStatus(found.length ? 'ok' : 'empty');
        setActive(found.length ? 0 : -1);
        setOpen(true);
      } catch (err) {
        if (err.name !== 'AbortError') {
          setItems([]);
          setStatus('error');
          setOpen(true);
        }
      }
    }, 250);
    return () => {
      clearTimeout(timer);
      ctl.abort();
    };
    // bias intentionally excluded: a moving map should not re-fire searches.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  useEffect(() => {
    function onDocClick(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  function pick(place) {
    onPick(place);
    setQuery('');
    setItems([]);
    setOpen(false);
    setStatus('idle');
  }

  function onKeyDown(e) {
    if (e.key === 'ArrowDown' && items.length) {
      e.preventDefault();
      setOpen(true);
      setActive((i) => (i + 1) % items.length);
    } else if (e.key === 'ArrowUp' && items.length) {
      e.preventDefault();
      setActive((i) => (i - 1 + items.length) % items.length);
    } else if (e.key === 'Enter') {
      if (open && active >= 0 && items[active]) {
        e.preventDefault();
        pick(items[active]);
      }
    } else if (e.key === 'Escape') {
      setOpen(false);
    }
  }

  const statusText = { loading: 'searching…', error: 'no connection' }[status];

  return (
    <div className="search" ref={wrapRef}>
      <div className="search-field">
        <Search />
        <input
          type="text"
          dir="auto"
          value={query}
          placeholder={placeholder}
          autoFocus={autoFocus}
          autoComplete="off"
          spellCheck="false"
          role="combobox"
          aria-expanded={open}
          aria-controls={listId}
          aria-autocomplete="list"
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => items.length && setOpen(true)}
          onKeyDown={onKeyDown}
        />
        {statusText && <span className="status">{statusText}</span>}
      </div>
      {open && (
        <ul className="suggest" id={listId} role="listbox">
          {items.map((p, i) => (
            <li
              key={p.id}
              role="option"
              aria-selected={i === active}
              onMouseEnter={() => setActive(i)}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => pick(p)}
            >
              <span className="primary" dir="auto">
                {p.primary}
              </span>
              {p.secondary && (
                <span className="secondary" dir="auto">
                  {p.secondary}
                </span>
              )}
            </li>
          ))}
          {status === 'empty' && <li className="empty">No place matches that. Try adding the city or country.</li>}
          {status === 'error' && <li className="empty">The address service didn’t answer. Check your connection and try again.</li>}
        </ul>
      )}
    </div>
  );
}
