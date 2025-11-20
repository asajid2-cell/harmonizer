/**
 * CodeSniff Main Application
 */

import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { AlertCircle, FolderOpen, Trash2, X, MessageCircle, Upload, ChevronDown, Check } from 'lucide-react';
import SearchBar from './components/SearchBar';
import ResultCard from './components/ResultCard';
import CodeViewer from './components/CodeViewer';
import LoadingAnimation from './components/LoadingAnimation';
import ChatPanel from './components/ChatPanel';
import UploadModal from './components/UploadModal';
import SemanticExcavation from './components/SemanticExcavation';
import ParticleVeil from './components/ParticleVeil';
import ResultsSelect from './components/ResultsSelect';
import { useSearch } from './hooks/useSearch';
import { useStats } from './hooks/useStats';
import { SearchResult, IndexedFile, apiClient } from './api/client';

const HERO_EXAMPLES = [
  { label: 'Find functions that parse JSON', query: 'functions that parse JSON', featured: true },
  { label: 'Trace async data loaders', query: 'async functions that fetch data' },
  { label: 'Locate authentication middleware', query: 'authentication middleware' },
  { label: 'Search rate limiting logic', query: 'rate limiting logic' },
  { label: 'Inspect pagination helpers', query: 'pagination helpers' },
  { label: 'Find JWT token generation', query: 'JWT token generation' },
  { label: 'Search file upload handlers', query: 'code that handles file uploads' },
  { label: 'Map database connectors', query: 'code that connects to database' },
];

function App() {
  const { results, isLoading, error, searchTime, search } = useSearch();
  const { stats, refresh: refetchStats } = useStats(true);
  const [selectedResult, setSelectedResult] = useState<SearchResult | null>(null);
  const [isCodeViewerOpen, setIsCodeViewerOpen] = useState(false);
  const [isFilesModalOpen, setIsFilesModalOpen] = useState(false);
  const [indexedFiles, setIndexedFiles] = useState<IndexedFile[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [resultsLimit, setResultsLimit] = useState(20);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([]);
  const [isLanguageDropdownOpen, setIsLanguageDropdownOpen] = useState(false);
  const languageDropdownRef = useRef<HTMLDivElement>(null);

  const handleSearch = async (query: string) => {
    if (query.trim()) {
      setHasSearched(true);
      setSearchQuery(query);
      await search(query, {
        limit: resultsLimit,
        min_similarity: 0.4,
        language_filter: selectedLanguages.length > 0 ? selectedLanguages : undefined,
      });
    } else {
      setHasSearched(false);
      setSearchQuery('');
    }
  };

  const handleExampleSearch = (exampleQuery: string) => {
    setSearchQuery(exampleQuery);
    handleSearch(exampleQuery);
  };

  const handleViewCode = (result: SearchResult) => {
    setSelectedResult(result);
    setIsCodeViewerOpen(true);
  };

  const handleCloseCodeViewer = () => {
    setIsCodeViewerOpen(false);
    setTimeout(() => setSelectedResult(null), 300);
  };

  const handleViewFiles = async () => {
    setIsLoadingFiles(true);
    try {
      const response = await apiClient.getFiles();
      setIndexedFiles(response.files);
      setIsFilesModalOpen(true);
    } catch (err) {
      console.error('Failed to load files:', err);
    } finally {
      setIsLoadingFiles(false);
    }
  };

  const handleClearIndex = async () => {
    if (!confirm('Are you sure you want to clear all indexed data? This cannot be undone.')) {
      return;
    }
    setIsClearing(true);
    try {
      await apiClient.clearIndex();
      setIndexedFiles([]);
      setIsFilesModalOpen(false);
      refetchStats();
    } catch (err) {
      console.error('Failed to clear index:', err);
    } finally {
      setIsClearing(false);
    }
  };

  const handleIndexComplete = () => {
    refetchStats();
  };

  const availableLanguages = [
    { value: 'python', label: 'Python' },
    { value: 'javascript', label: 'JavaScript' },
    { value: 'typescript', label: 'TypeScript' },
    { value: 'java', label: 'Java' },
    { value: 'kotlin', label: 'Kotlin' },
    { value: 'html', label: 'HTML' },
    { value: 'css', label: 'CSS' },
  ];

  const toggleLanguage = (lang: string) => {
    setSelectedLanguages((prev) => (prev.includes(lang) ? prev.filter((l) => l !== lang) : [...prev, lang]));
  };

  useEffect(() => {
    if (hasSearched && searchQuery.trim()) {
      handleSearch(searchQuery);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLanguages]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (languageDropdownRef.current && !languageDropdownRef.current.contains(event.target as Node)) {
        setIsLanguageDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  return (
    <div className="relative min-h-screen overflow-x-hidden bg-transparent text-slate-100">
      <div className="global-backdrop" aria-hidden="true" />
      <div className="global-particles" aria-hidden="true">
        <ParticleVeil />
      </div>
      <div className="pointer-events-none absolute inset-0 opacity-60" aria-hidden="true">
        <div className="absolute inset-x-0 top-[-320px] h-[520px] bg-[radial-gradient(circle_at_top,rgba(62,106,255,0.3),transparent_65%)] blur-[160px]" />
      </div>

      <div className="relative z-10 flex min-h-screen flex-col">
        <header className="sticky top-0 z-30 border-b border-white/5 bg-[#05070f]/80 backdrop-blur-2xl">
          <div className="mx-auto flex max-w-6xl items-center justify-between px-6 py-4">
            <div className="flex items-center gap-6">
              <button
                onClick={() => window.location.reload()}
                className="flex items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white text-base font-bold text-gray-900 shadow-[0_8px_24px_rgba(255,255,255,0.3)]">
                  CS
                </div>
                <div>
                  <p className="text-base font-semibold text-white">CodeSniff</p>
                  <p className="text-[0.65rem] uppercase tracking-[0.35em] text-slate-400">Semantic Search</p>
                </div>
              </button>
            </div>
            <div className="flex items-center gap-2">
              {stats && (
                <div className="hidden items-center rounded-lg border border-white/10 px-3 py-1 text-[0.65rem] uppercase tracking-[0.35em] text-slate-400 lg:flex">
                  {stats.total_symbols.toLocaleString()} symbols
                </div>
              )}
              <button
                onClick={handleViewFiles}
                disabled={isLoadingFiles}
                title="View indexed files"
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 text-slate-300 transition-colors hover:border-white/30 hover:text-white disabled:opacity-50"
              >
                <FolderOpen className="h-4 w-4" />
              </button>
              <button
                onClick={handleClearIndex}
                disabled={isClearing}
                title="Clear indexed data"
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 text-slate-300 transition-colors hover:border-red-400 hover:text-red-300 disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" />
              </button>
              <button
                onClick={() => setIsUploadModalOpen(true)}
                title="Upload & index"
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 text-slate-300 transition-colors hover:border-white/30 hover:text-white"
              >
                <Upload className="h-4 w-4" />
              </button>
              <button
                onClick={() => setIsChatOpen(!isChatOpen)}
                title="AI Assistant"
                className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 text-slate-300 transition-colors hover:border-white/30 hover:text-white"
              >
                <MessageCircle className="h-4 w-4" />
              </button>
            </div>
          </div>
        </header>

        <main className="flex-1">
          <section className="hero-stage relative px-6 pb-12 pt-12 lg:pt-20">
            <SemanticExcavation className="hero-stage__visual" />
            <div className="hero-stage__inner mx-auto max-w-6xl">
              <div className="hero-stage__copy">
                <h1 className="mt-4 text-4xl font-semibold leading-tight text-white sm:text-5xl">
                  Semantic code search designed for efficiency.
                </h1>
                <p className="mt-4 max-w-2xl text-lg text-slate-300">
                  CodeSniff analyzes behavior, structure, and intent, allowing you to navigate complex codebases intuitively and reduce your time spent tracing logic.
                </p>
                <div className="mt-8">
                  <SearchBar
                    onSearch={handleSearch}
                    isLoading={isLoading}
                    externalQuery={searchQuery}
                    onQueryChange={setSearchQuery}
                    placeholder="Search by behavior, e.g., 'validate email addresses'..."
                  />
                </div>

                <div className="mt-6">
                  <p className="text-[0.72rem] uppercase tracking-[0.3em] text-slate-500">Suggested queries</p>
                  <div className="suggestion-cloud mt-4">
                    {HERO_EXAMPLES.map((example) => (
                      <button
                        key={example.label}
                        type="button"
                        onClick={() => handleExampleSearch(example.query)}
                        className={`chip-suggestion px-5 py-3 ${example.featured ? 'is-active' : ''}`}
                      >
                        {example.label}
                      </button>
                    ))}
                  </div>
                </div>

                {stats && (
                  <div className="mt-10">
                    <div className="status-strip">
                      <span>INDEXED: {stats.total_symbols?.toLocaleString() ?? '0'}</span>
                      <span>FILES: {stats.total_files?.toLocaleString() ?? '0'}</span>
                      <span>VECTORS: {stats.vector_count?.toLocaleString() ?? '0'}</span>
                    </div>
                  </div>
                )}

                <div className="mt-8 flex flex-wrap items-center gap-4 text-sm text-slate-300">
                  <div className="pill-control">
                    <span className="pill-control__label">Results</span>
                    <ResultsSelect value={resultsLimit} options={[10, 20, 50, 100]} onChange={(value) => setResultsLimit(value)} />
                  </div>

                  <div className="relative" ref={languageDropdownRef}>
                    <button
                      onClick={() => setIsLanguageDropdownOpen(!isLanguageDropdownOpen)}
                      className="flex items-center gap-2 rounded-lg border border-white/10 px-4 py-2 text-sm text-slate-200 transition-colors hover:border-white/30"
                    >
                      <span className="text-[0.7rem] uppercase tracking-[0.3em] text-slate-500">Languages</span>
                      {selectedLanguages.length > 0 ? (
                        <span className="rounded-md bg-white/10 px-2 py-0.5 text-xs text-white">
                          {selectedLanguages.length}
                        </span>
                      ) : (
                        <span className="text-slate-400">All</span>
                      )}
                      <ChevronDown className={`h-4 w-4 transition-transform ${isLanguageDropdownOpen ? 'rotate-180' : ''}`} />
                    </button>

                    {isLanguageDropdownOpen && (
                      <div className="absolute right-0 z-50 mt-3 w-60 rounded-xl border border-white/10 bg-[#06080f]/95 p-2 text-sm shadow-[0_30px_80px_rgba(4,6,11,0.8)]">
                        {selectedLanguages.length > 0 && (
                          <>
                            <button
                              onClick={() => setSelectedLanguages([])}
                              className="w-full rounded-lg px-3 py-2 text-left text-blue-200 transition-colors hover:bg-white/5"
                            >
                              Clear all
                            </button>
                            <div className="my-2 h-px bg-white/5" />
                          </>
                        )}
                        {availableLanguages.map((lang) => (
                          <button
                            key={lang.value}
                            onClick={() => toggleLanguage(lang.value)}
                            className="flex w-full items-center justify-between rounded-lg px-3 py-2 text-left text-slate-200 transition-colors hover:bg-white/5"
                          >
                            <span>{lang.label}</span>
                            {selectedLanguages.includes(lang.value) && (
                              <Check className="h-4 w-4 text-blue-300" />
                            )}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>

                {!stats?.ready && (
                  <div className="mt-6 rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                    No code indexed yet. Use the API or upload to prime CodeSniff.
                  </div>
                )}
              </div>
            </div>
          </section>

          <section className="mx-auto max-w-6xl px-6 pb-16 pt-6">
            {error && (
              <div className="mb-8 rounded-xl border border-red-500/40 bg-red-500/10 p-5">
                <div className="flex items-start gap-3">
                  <AlertCircle className="h-5 w-5 text-red-300" />
                  <div>
                    <h3 className="mb-1 text-base font-semibold text-red-100">Search failed</h3>
                    <p className="text-sm text-red-200">{error}</p>
                  </div>
                </div>
              </div>
            )}

            {!isLoading && !error && results.length === 0 && hasSearched && (
              <div className="rounded-2xl border border-white/10 bg-white/5 px-8 py-12 text-center">
                <div className="mx-auto max-w-md">
                  <AlertCircle className="mx-auto mb-4 h-12 w-12 text-slate-400" />
                  <h3 className="text-lg font-semibold text-white">No matches yet</h3>
                  <p className="mt-3 text-sm text-slate-400">
                    Nothing cleared the similarity threshold (&gt;40%). Refine the behavior description or widen the scope.
                  </p>
                </div>
              </div>
            )}

            {!results.length && !isLoading && !error && !hasSearched && (
              <div className="max-w-2xl">
                <p className="text-sm leading-relaxed text-slate-400">
                  Search by behavior, structure, or goal. Relevant matches appear instantly, prioritized by context and logic.
                </p>
              </div>
            )}

            {results.length > 0 && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-semibold text-white">
                    {results.length} result{results.length !== 1 ? 's' : ''}
                  </h2>
                  <p className="mt-1 text-sm text-slate-400">{searchTime.toFixed(0)}ms</p>
                </div>
                <div className="space-y-3">
                  {results.map((result, index) => (
                    <ResultCard
                      key={`${result.file_path}-${result.symbol_name}-${index}`}
                      result={result}
                      index={index}
                      onViewCode={handleViewCode}
                    />
                  ))}
                </div>
              </div>
            )}
          </section>
        </main>
      </div>

      <AnimatePresence>
        {isLoading && <LoadingAnimation />}
      </AnimatePresence>

      <CodeViewer result={selectedResult} isOpen={isCodeViewerOpen} onClose={handleCloseCodeViewer} />

      <ChatPanel isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} />

      <UploadModal isOpen={isUploadModalOpen} onClose={() => setIsUploadModalOpen(false)} onIndexComplete={handleIndexComplete} />

      <AnimatePresence>
        {isFilesModalOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setIsFilesModalOpen(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-gray-900 rounded-xl border border-gray-700 w-full max-w-4xl max-h-[80vh] overflow-hidden"
            >
              <div className="p-4 border-b border-gray-700 flex items-center justify-between">
                <h2 className="text-xl font-bold text-white">Indexed Files ({indexedFiles.length})</h2>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleClearIndex}
                    disabled={isClearing}
                    className="px-3 py-1.5 bg-red-500/20 text-red-400 rounded-lg text-sm hover:bg-red-500/30 transition-colors flex items-center gap-2"
                  >
                    <Trash2 className="w-4 h-4" />
                    {isClearing ? 'Clearing...' : 'Clear All'}
                  </button>
                  <button onClick={() => setIsFilesModalOpen(false)} className="p-1.5 text-gray-400 hover:text-white transition-colors">
                    <X className="w-5 h-5" />
                  </button>
                </div>
              </div>
              <div className="overflow-y-auto max-h-[calc(80vh-80px)]">
                {indexedFiles.length === 0 ? (
                  <div className="p-8 text-center text-gray-500">No files indexed yet</div>
                ) : (
                  <table className="w-full">
                    <thead className="bg-gray-800/50 sticky top-0">
                      <tr>
                        <th className="text-left p-3 text-sm text-gray-400 font-medium">File Path</th>
                        <th className="text-right p-3 text-sm text-gray-400 font-medium">Lines</th>
                        <th className="text-right p-3 text-sm text-gray-400 font-medium">Symbols</th>
                        <th className="text-right p-3 text-sm text-gray-400 font-medium">Indexed</th>
                      </tr>
                    </thead>
                    <tbody>
                      {indexedFiles.map((file) => (
                        <tr key={file.id} className="border-t border-gray-800 hover:bg-gray-800/30">
                          <td className="p-3 text-sm text-gray-300 font-mono truncate max-w-md" title={file.path}>
                            {file.path}
                          </td>
                          <td className="p-3 text-sm text-gray-400 text-right">{file.total_lines}</td>
                          <td className="p-3 text-sm text-gray-400 text-right">{file.symbol_count}</td>
                          <td className="p-3 text-sm text-gray-500 text-right">{new Date(file.indexed_at).toLocaleDateString()}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default App;
