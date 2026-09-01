import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { CINEMA_TOKENS } from '../design/tokens';

export interface CinemaDropdownOption {
  readonly id: string;
  readonly label: string;
}

export function CinemaDropdown({
  label,
  options,
  selectedId,
  onSelect,
}: {
  readonly label: string;
  readonly options: readonly CinemaDropdownOption[];
  readonly selectedId: string | undefined;
  readonly onSelect: (id: string) => void;
}) {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <div className="relative inline-block text-start">
      <button
        type="button"
        onClick={() => setIsOpen((open) => !open)}
        className={CINEMA_TOKENS.dropdown.button}
      >
        <span>{options.find((o) => o.id === selectedId)?.label ?? label}</span>
        <ChevronDown
          className={`w-3.5 h-3.5 text-zinc-300 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
        />
      </button>
      {isOpen && (
        <div className={CINEMA_TOKENS.dropdown.menu}>
          {options.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onClick={() => {
                onSelect(opt.id);
                setIsOpen(false);
              }}
              className={`${CINEMA_TOKENS.dropdown.item} ${opt.id === selectedId ? CINEMA_TOKENS.dropdown.activeItem : ''}`}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
