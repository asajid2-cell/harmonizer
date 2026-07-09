import { useState, useEffect, useRef, useCallback } from 'react';
import { Search, X } from 'lucide-react';

interface SearchBarProps {
  onSearch: (query: string) => void;
  isLoading?: boolean;
  placeholder?: string;
  debounceMs?: number;
  externalQuery?: string;
  onQueryChange?: (query: string) => void;
}

const PLACEHOLDER_PROMPTS = [
  'Find auth middleware...',
  'Trace async data loaders...',
  'Map pagination regressions...',
  'Locate rate limiter tuning...',
  'Inspect webhook signatures...',
] as const;

export const SearchBar: React.FC<SearchBarProps> = ({
  onSearch,
  isLoading = false,
  placeholder = '',
  debounceMs = 300,
  externalQuery,
  onQueryChange,
}) => {
  const [query, setQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const typingTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [placeholderCycle, setPlaceholderCycle] = useState(0);
  const [typedPlaceholder, setTypedPlaceholder] = useState('');

  // Sync with external query if provided
  useEffect(() => {
    if (externalQuery !== undefined && externalQuery !== query) {
      setQuery(externalQuery);
    }
  }, [externalQuery]);

  // Animated placeholder typing effect when input is empty
  useEffect(() => {
    if (query) {
      setTypedPlaceholder('');
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
      return;
    }

    const promptsCount = PLACEHOLDER_PROMPTS.length;
    const currentPrompt = PLACEHOLDER_PROMPTS[placeholderCycle % promptsCount];
    let charIndex = 0;
    let forward = true;

    const type = () => {
      if (forward) {
        charIndex += 1;
        setTypedPlaceholder(currentPrompt.slice(0, charIndex));

        if (charIndex === currentPrompt.length) {
          forward = false;
          typingTimeoutRef.current = setTimeout(type, 1200);
          return;
        }
      } else {
        charIndex -= 1;
        setTypedPlaceholder(currentPrompt.slice(0, charIndex));

        if (charIndex === 0) {
          setPlaceholderCycle((prev) => (prev + 1) % promptsCount);
          return;
        }
      }

      typingTimeoutRef.current = setTimeout(type, forward ? 55 : 35);
    };

    typingTimeoutRef.current = setTimeout(type, 250);

    return () => {
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, [placeholderCycle, query]);

  // Keyboard shortcut (Cmd/Ctrl + K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        inputRef.current?.focus();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Debounced search - triggers as user types
  const debouncedSearch = useCallback((searchQuery: string) => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }

    debounceRef.current = setTimeout(() => {
      onSearch(searchQuery.trim());
    }, debounceMs);
  }, [onSearch, debounceMs]);

  // Handle input change - search in real-time
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newQuery = e.target.value;
    setQuery(newQuery);
    onQueryChange?.(newQuery);
    debouncedSearch(newQuery);
  };

  // Restore focus after parent re-renders if input was focused
  useEffect(() => {
    if (isFocused && inputRef.current && document.activeElement !== inputRef.current) {
      inputRef.current.focus();
    }
  });

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    // Cancel any pending debounce and search immediately
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    onSearch(query.trim());
  };

  const handleClear = () => {
    setQuery('');
    onQueryChange?.('');
    // Cancel any pending debounce
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    // Trigger empty search to show homepage
    onSearch('');
    inputRef.current?.focus();
  };

  return (
    <div className="min-w-0 w-full px-0 sm:px-2">
      <div className="search-shell">
        <form onSubmit={handleSubmit} className="relative">
          <div className={`search-field ${isFocused ? 'is-focused' : ''}`}>
            <div className="search-field-inner">
              <Search className="mr-4 h-5 w-5 text-slate-500" />
              <input
                ref={inputRef}
                type="text"
                aria-label="Search your codebase"
                value={query}
                onChange={handleChange}
                onFocus={() => setIsFocused(true)}
                onBlur={() => setIsFocused(false)}
                placeholder={placeholder || undefined}
                className="h-16 w-full bg-transparent text-lg text-slate-50 placeholder:text-transparent caret-blue-400 focus:outline-none"
                disabled={isLoading}
                autoComplete="off"
                autoCorrect="off"
                autoCapitalize="off"
                spellCheck="false"
              />
              {!query && (
                <div className="typing-placeholder" aria-hidden="true">
                  <span>{typedPlaceholder || PLACEHOLDER_PROMPTS[placeholderCycle % PLACEHOLDER_PROMPTS.length]}</span>
                  <span className="typing-caret" />
                </div>
              )}
              {query && (
                <button
                  type="button"
                  onClick={handleClear}
                  className="absolute right-20 top-1/2 -translate-y-1/2 rounded-lg p-2 text-slate-400 transition hover:bg-white/5 hover:text-white"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
              <span className="shortcut-hint">Ctrl K</span>
            </div>
          </div>
        </form>
        <div className={`search-reflection ${isFocused ? 'is-active' : ''}`} aria-hidden="true" />
      </div>
    </div>
  );
};

export default SearchBar;
