import { PERSONAS } from "./personas.js";

export default function PersonaPicker({ selectedId, onSelect, disabled = false }) {
  return (
    <div className="persona-picker" role="radiogroup" aria-label="Call persona">
      {PERSONAS.map((persona) => {
        const selected = persona.id === selectedId;
        return (
          <button
            key={persona.id}
            type="button"
            role="radio"
            aria-checked={selected}
            className={`persona-picker-card ${selected ? "is-selected" : ""}`}
            disabled={disabled}
            onClick={() => onSelect(persona.id)}
          >
            <span className="persona-picker-title">{persona.label}</span>
            <span className="persona-picker-desc">{persona.description}</span>
            {persona.packIds.length > 0 && (
              <span className="persona-picker-packs">
                Packs: {persona.packIds.join(", ")}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
