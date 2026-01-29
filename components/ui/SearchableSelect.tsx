'use client';

import { useState, useRef, useEffect, useMemo } from 'react';

export type SearchableOption = { value: string | number; label: string };

type Props = {
  options: SearchableOption[];
  value: string | number | '';
  onChange: (value: string | number | '') => void;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  id?: string;
};

export function SearchableSelect({
  options,
  value,
  onChange,
  placeholder = 'Type to search…',
  disabled = false,
  className = '',
  id,
}: Props) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const filtered = useMemo(() => {
    const q = (query || '').trim().toLowerCase();
    if (!q) return options;
    return options.filter(
      (opt) =>
        (opt.label && opt.label.toLowerCase().includes(q)) ||
        String(opt.value).toLowerCase().includes(q)
    );
  }, [options, query]);

  const selectedOption = useMemo(
    () => options.find((o) => String(o.value) === String(value)),
    [options, value]
  );

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setQuery('');
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const displayText = isOpen ? query : selectedOption ? selectedOption.label : '';

  const inputClassName = className || 'w-full border border-slate-300 rounded-lg px-3 py-2 text-sm bg-white disabled:bg-slate-50 disabled:text-slate-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent';
  return (
    <div ref={containerRef} className="relative w-full">
      <input
        ref={inputRef}
        type="text"
        id={id}
        value={displayText}
        onChange={(e) => {
          setQuery(e.target.value);
          if (!isOpen) setIsOpen(true);
        }}
        onFocus={() => {
          setIsOpen(true);
          setQuery('');
        }}
        placeholder={placeholder}
        disabled={disabled}
        className={inputClassName}
        autoComplete="off"
        role="combobox"
        aria-expanded={isOpen}
        aria-autocomplete="list"
      />
      {isOpen && (
        <ul
          className="absolute z-[1000] mt-1 w-full max-h-48 overflow-auto rounded-md border border-slate-200 bg-white shadow-lg py-1 text-sm"
          role="listbox"
        >
          {filtered.length === 0 ? (
            <li className="px-3 py-2 text-slate-500">No matches</li>
          ) : (
            filtered.map((opt) => (
              <li
                key={String(opt.value)}
                role="option"
                aria-selected={String(opt.value) === String(value)}
                className={`px-3 py-2 cursor-pointer hover:bg-blue-50 ${
                  String(opt.value) === String(value) ? 'bg-blue-50 text-blue-800 font-medium' : 'text-slate-800'
                }`}
                onMouseDown={(e) => {
                  e.preventDefault();
                  onChange(opt.value);
                  setIsOpen(false);
                  setQuery('');
                  inputRef.current?.blur();
                }}
              >
                {opt.label}
              </li>
            ))
          )}
        </ul>
      )}
    </div>
  );
}
