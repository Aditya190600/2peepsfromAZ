import { CUSTOM_PHONE_OPTION, formatPhoneNumber } from "./settingsView.js";

function optionLabel(option) {
  if (option.id === CUSTOM_PHONE_OPTION) return option.label;
  const formatted = formatPhoneNumber(option.number);
  return option.label ? `${option.label} (${formatted})` : formatted;
}

export default function PhoneNumberMenu({
  options,
  selectedId,
  customValue,
  onSelect,
  onCustomChange,
  disabled = false,
  id = "settings-phone-menu",
}) {
  const showCustomInput = selectedId === CUSTOM_PHONE_OPTION;

  return (
    <div className="settings-phone-menu">
      <label className="settings-phone-menu-label" htmlFor={id}>
        Phone number
      </label>
      <select
        id={id}
        className="settings-phone-menu-select"
        value={selectedId}
        disabled={disabled}
        onChange={(e) => onSelect(e.target.value)}
      >
        {options.map((option) => (
          <option key={option.id} value={option.id}>
            {optionLabel(option)}
          </option>
        ))}
      </select>
      {showCustomInput && (
        <input
          type="tel"
          className="settings-phone-menu-custom"
          placeholder="+1 555 555 0100"
          value={customValue}
          disabled={disabled}
          onChange={(e) => onCustomChange(e.target.value)}
          aria-label="Custom phone number"
        />
      )}
    </div>
  );
}
