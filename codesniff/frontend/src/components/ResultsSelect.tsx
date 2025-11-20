import { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

interface ResultsSelectProps {
  value: number;
  options: number[];
  onChange: (value: number) => void;
}

const ResultsSelect = ({ value, options, onChange }: ResultsSelectProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (option: number) => {
    onChange(option);
    setIsOpen(false);
  };

  return (
    <div className="pill-control__select" ref={containerRef}>
      <button
        type="button"
        className="pill-control__button"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((prev) => !prev)}
      >
        {value}
        <ChevronDown className={`h-4 w-4 transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>
      {isOpen && (
        <div className="pill-control__menu" role="listbox">
          {options.map((option) => (
            <button
              type="button"
              key={option}
              className={`pill-control__option ${option === value ? 'is-selected' : ''}`}
              onClick={() => handleSelect(option)}
              role="option"
              aria-selected={option === value}
            >
              {option}
            </button>
          ))}
        </div>
      )}
    </div>
  );
};

export default ResultsSelect;
