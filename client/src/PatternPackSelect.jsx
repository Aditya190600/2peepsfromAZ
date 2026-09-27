/**
 * Shared industry pattern-pack checkboxes with hover/focus identifier tooltips.
 * A checked pack shows its own `asserts` copy directly under its checkbox line.
 */

export function packTooltipContent(pack) {
  const labels = pack.patterns?.map((p) => p.label).filter(Boolean) ?? [];
  if (labels.length > 0) return { kind: "list", labels };
  if (pack.detectionSummary) return { kind: "summary", text: pack.detectionSummary };
  if (pack.asserts) return { kind: "summary", text: pack.asserts };
  return { kind: "summary", text: "Catalog unavailable" };
}

function PackTooltip({ pack }) {
  const content = packTooltipContent(pack);
  return (
    <span id={`pack-tip-${pack.id}`} role="tooltip" className="pack-tooltip">
      <span className="pack-tooltip-title">Looks for</span>
      {content.kind === "list" ? (
        <ul className="pack-tooltip-list">
          {content.labels.map((label) => (
            <li key={label}>{label}</li>
          ))}
        </ul>
      ) : (
        <p className="pack-tooltip-summary">{content.text}</p>
      )}
    </span>
  );
}

export default function PatternPackSelect({ packs, selectedPacks, onToggle }) {
  return (
    <div className="pack-select">
      {packs.map((pack) => {
        const checked = selectedPacks.includes(pack.id);
        return (
          <div className="pack-item" key={pack.id}>
            <label className="check-row pack-row">
              <input
                type="checkbox"
                checked={checked}
                onChange={() => onToggle(pack.id)}
                aria-describedby={`pack-tip-${pack.id}`}
              />
              <span className="pack-row-body">
                {pack.name}
                <PackTooltip pack={pack} />
              </span>
            </label>
            {checked && pack.asserts && <p className="pack-note pack-asserts">{pack.asserts}</p>}
          </div>
        );
      })}
    </div>
  );
}
