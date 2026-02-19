interface SettingsToggleProps {
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
}

export default function SettingsToggle({
  label,
  description,
  checked,
  onChange,
}: SettingsToggleProps) {
  return (
    <div className="flex items-center justify-between py-4 border-b border-glass-border last:border-b-0">
      <div className="flex-1 mr-4">
        <p className="text-sm font-medium text-text-primary">{label}</p>
        <p className="text-xs text-text-muted mt-0.5">{description}</p>
      </div>
      <input
        type="checkbox"
        className="toggle-ios"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
    </div>
  );
}
