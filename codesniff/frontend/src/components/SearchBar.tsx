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

export const SearchBar: React.FC<SearchBarProps> = ({
  onSearch,
  isLoading = false,
  placeholder = 'Search for functions, classes, or code patterns...',
  debounceMs = 300,
  externalQuery,
  onQueryChange,
}) => {
  const [query, setQuery] = useState('');
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<NodeJS.Timeout | null>(null);

  // Sync with external query if provided
  useEffect(() => {
    if (externalQuery !== undefined && externalQuery !== query) {
      setQuery(externalQuery);
    }
  }, [externalQuery]);

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
    // Cancel any pending debounce
    if (debounceRef.current) {
      clearTimeout(debounceRef.current);
    }
    // Trigger empty search to show homepage
    onSearch('');
    inputRef.current?.focus();
  };

  return (
    <div className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-[#0d1117] sticky top-0 z-50">
      <div className="max-w-6xl mx-auto px-6 py-4">
        <div className="flex items-center gap-4">
          {/* Logo */}
          <button
            onClick={() => window.location.reload()}
            className="flex items-center gap-2 hover:opacity-80 transition-opacity flex-shrink-0"
          >
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-sm">CS</span>
            </div>
            <span className="text-lg font-semibold text-gray-900 dark:text-white hidden sm:inline">
              CodeSniff
            </span>
          </button>

          {/* Search form */}
          <form onSubmit={handleSubmit} className="flex-1">
            <div className="flex items-center gap-3">
              <div className="flex-1 relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 dark:text-gray-500" />
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={handleChange}
                  onFocus={() => setIsFocused(true)}
                  onBlur={() => setIsFocused(false)}
                  placeholder={placeholder}
                  className="w-full pl-10 pr-10 py-2 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-md text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  disabled={isLoading}
                />
                {query && (
                  <button
                    type="button"
                    onClick={handleClear}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
                  >
                    <X className="w-3.5 h-3.5 text-gray-500 dark:text-gray-400" />
                  </button>
                )}
              </div>
              <button
                type="submit"
                disabled={!query.trim() || isLoading}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 dark:disabled:bg-gray-700 text-white disabled:text-gray-500 dark:disabled:text-gray-400 rounded-md font-medium transition-colors disabled:cursor-not-allowed"
              >
                {isLoading ? 'Searching...' : 'Search'}
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default SearchBar;
