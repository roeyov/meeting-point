import { useState } from 'react';
import AddressSearch from './AddressSearch.jsx';
import { formatKm } from '../geo.js';
import { Pencil, Trash } from '../icons.jsx';

export default function AddressRow({ index, address, color, distanceKm, maxKm, onChange, onRemove }) {
  const [editing, setEditing] = useState(false);
  const skipped = address.weight === 0;

  return (
    <li className={`row${skipped ? ' skipped' : ''}`}>
      <span className="pin" style={{ '--c': color }} aria-hidden="true">
        {index + 1}
      </span>
      <div className="row-main">
        <input
          className="label-input"
          type="text"
          dir="auto"
          value={address.label}
          placeholder="Name (optional)"
          aria-label={`Name for address ${index + 1}`}
          onChange={(e) => onChange({ label: e.target.value })}
        />
        <span className="addr" dir="auto">
          {address.address || `${address.lat.toFixed(5)}, ${address.lng.toFixed(5)}`}
        </span>
        {distanceKm != null && !skipped && (
          <span className="dist" title="Straight-line distance to the middle">
            <span className="bar">
              <i style={{ '--c': color, '--w': `${maxKm ? Math.max(4, (distanceKm / maxKm) * 100) : 0}%` }} />
            </span>
            {formatKm(distanceKm)}
          </span>
        )}
        {skipped && <span className="note">Skipped (weight 0)</span>}
      </div>
      <div className="row-actions">
        <span className="weight" title="How many people come from here">
          <button type="button" aria-label="Fewer people" onClick={() => onChange({ weight: Math.max(0, address.weight - 1) })}>
            −
          </button>
          <output aria-live="polite">×{address.weight}</output>
          <button type="button" aria-label="More people" onClick={() => onChange({ weight: address.weight + 1 })}>
            +
          </button>
        </span>
        <button type="button" className="icon-btn" title="Change address" aria-label="Change address" onClick={() => setEditing((v) => !v)}>
          <Pencil />
        </button>
        <button type="button" className="icon-btn danger" title="Remove" aria-label="Remove address" onClick={onRemove}>
          <Trash />
        </button>
      </div>
      {editing && (
        <div className="row-edit">
          <AddressSearch
            autoFocus
            placeholder="Search a different address"
            initialQuery={address.address}
            bias={{ lat: address.lat, lng: address.lng }}
            onPick={(place) => {
              onChange({ address: place.address, lat: place.lat, lng: place.lng });
              setEditing(false);
            }}
          />
          <div>
            <button type="button" className="link-btn" onClick={() => setEditing(false)}>
              Cancel
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
