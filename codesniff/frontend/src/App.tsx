/**
 * CodeSniff Main Application
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Sparkles, Database, TrendingUp, AlertCircle, FolderOpen, Trash2, X, MessageCircle, Upload } from 'lucide-react';
import SearchBar from './components/SearchBar';
import ResultCard from './components/ResultCard';
import CodeViewer from './components/CodeViewer';
import LoadingAnimation from './components/LoadingAnimation';
import InfiniteScroll from './components/InfiniteScroll';
import ChatPanel from './components/ChatPanel';
import UploadModal from './components/UploadModal';
import { useSearch } from './hooks/useSearch';
import { useStats } from './hooks/useStats';
import { SearchResult, IndexedFile, apiClient } from './api/client';

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

  const handleSearch = async (query: string) => {
    if (query.trim()) {
      setHasSearched(true);
      setSearchQuery(query);
      await search(query, { limit: resultsLimit, min_similarity: 0.4 });
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

  return (
    <div className="min-h-screen bg-white dark:bg-[#0d1117]">
      {/* Content */}
      <div className="relative">
        {/* Search bar */}
        <SearchBar
          onSearch={handleSearch}
          isLoading={isLoading}
          externalQuery={searchQuery}
          onQueryChange={setSearchQuery}
        />

        {/* Header with stats */}
        <header className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-[#0d1117]">
          <div className="max-w-6xl mx-auto px-6 py-3">
            <div className="flex items-center justify-between">
              {stats && (
                <div className="flex items-center gap-3 text-sm text-gray-600 dark:text-gray-400">
                  <span>{stats.total_symbols.toLocaleString()} symbols</span>
                  <span>·</span>
                  <span>{stats.total_files} files</span>
                </div>
              )}
              <div className="flex items-center gap-3 ml-auto">
                {stats && (
                  <>
                    <div className="flex items-center gap-2">
                      <label htmlFor="results-limit" className="text-sm text-gray-600 dark:text-gray-400">
                        Results:
                      </label>
                      <select
                        id="results-limit"
                        value={resultsLimit}
                        onChange={(e) => setResultsLimit(Number(e.target.value))}
                        className="px-2 py-1 text-sm bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-md text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      >
                        <option value={10}>10</option>
                        <option value={20}>20</option>
                        <option value={50}>50</option>
                        <option value={100}>100</option>
                      </select>
                    </div>
                    <div className="w-px h-6 bg-gray-300 dark:bg-gray-700" />
                    <button
                      onClick={handleViewFiles}
                      disabled={isLoadingFiles}
                      className="p-2 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors"
                      title="View indexed files"
                    >
                      <FolderOpen className="w-4 h-4" />
                    </button>
                    <button
                      onClick={handleClearIndex}
                      disabled={isClearing}
                      className="p-2 text-gray-600 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors"
                      title="Clear all indexed data"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                    <div className="w-px h-6 bg-gray-300 dark:bg-gray-700" />
                  </>
                )}
                <button
                  onClick={() => setIsUploadModalOpen(true)}
                  className="p-2 text-gray-600 dark:text-gray-400 hover:text-green-600 dark:hover:text-green-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors"
                  title="Upload and index code"
                >
                  <Upload className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setIsChatOpen(!isChatOpen)}
                  className="p-2 text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-md transition-colors"
                  title="AI Assistant"
                >
                  <MessageCircle className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </header>

        {/* Main content area */}
        <div className="max-w-6xl mx-auto px-6 py-8">
          {/* Welcome state */}
          {!results.length && !isLoading && !error && !hasSearched && (
            <div className="py-16">
              <div className="max-w-2xl">
                <h2 className="text-3xl font-bold text-gray-900 dark:text-white mb-3">
                  Search code by what it does
                </h2>
                <p className="text-gray-600 dark:text-gray-400 mb-8">
                  Find functions, classes, and logic using plain English instead of grepping for variable names.
                </p>

                <div className="space-y-3">
                  <p className="text-sm font-medium text-gray-700 dark:text-gray-300">Example searches:</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                    {[
                      'functions that validate email addresses',
                      'code that connects to postgres',
                      'error handling for API requests',
                      'classes that parse JSON',
                      'async functions that fetch data',
                      'code that handles file uploads',
                      'authentication middleware',
                      'database query builders',
                      'rate limiting logic',
                      'input sanitization functions',
                      'JWT token generation',
                      'pagination helpers',
                    ].map((example) => (
                      <button
                        key={example}
                        onClick={() => handleExampleSearch(example)}
                        className="block w-full text-left px-4 py-2.5 text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-900 hover:bg-gray-100 dark:hover:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md transition-colors"
                      >
                        {example}
                      </button>
                    ))}
                  </div>
                </div>

                {!stats?.ready && (
                  <div className="mt-8 p-4 bg-amber-50 dark:bg-amber-900/10 border border-amber-200 dark:border-amber-900/50 rounded-md">
                    <p className="text-sm text-amber-900 dark:text-amber-200">
                      No code indexed yet. Use the API to index your codebase.
                    </p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Error state */}
          {error && (
            <div className="p-4 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-900/50 rounded-md">
              <div className="flex items-start gap-3">
                <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                <div>
                  <h3 className="text-red-900 dark:text-red-200 font-medium mb-1">Search failed</h3>
                  <p className="text-red-700 dark:text-red-300 text-sm">{error}</p>
                </div>
              </div>
            </div>
          )}

          {/* No results state */}
          {!isLoading && !error && results.length === 0 && hasSearched && (
            <div className="py-12 text-center">
              <div className="max-w-md mx-auto">
                <AlertCircle className="w-12 h-12 text-gray-400 dark:text-gray-600 mx-auto mb-4" />
                <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
                  No results found
                </h3>
                <p className="text-gray-600 dark:text-gray-400 text-sm">
                  No code matched your search with sufficient confidence (&gt;40%). Try rephrasing your query or using different keywords.
                </p>
              </div>
            </div>
          )}

          {/* Results */}
          {results.length > 0 && (
            <div>
              {/* Results header */}
              <div className="mb-6">
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                  {results.length} result{results.length !== 1 ? 's' : ''}
                </h2>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  {searchTime.toFixed(0)}ms
                </p>
              </div>

              {/* Results list */}
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
        </div>

        {/* Loading overlay */}
        <AnimatePresence>
          {isLoading && <LoadingAnimation />}
        </AnimatePresence>

        {/* Code viewer modal */}
        <CodeViewer
          result={selectedResult}
          isOpen={isCodeViewerOpen}
          onClose={handleCloseCodeViewer}
        />

        {/* Chat panel */}
        <ChatPanel isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} />

        {/* Upload modal */}
        <UploadModal
          isOpen={isUploadModalOpen}
          onClose={() => setIsUploadModalOpen(false)}
          onIndexComplete={handleIndexComplete}
        />

        {/* Files modal */}
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
                className="bg-gray-900 rounded-2xl border border-gray-700 w-full max-w-4xl max-h-[80vh] overflow-hidden"
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
                    <button
                      onClick={() => setIsFilesModalOpen(false)}
                      className="p-1.5 text-gray-400 hover:text-white transition-colors"
                    >
                      <X className="w-5 h-5" />
                    </button>
                  </div>
                </div>
                <div className="overflow-y-auto max-h-[calc(80vh-80px)]">
                  {indexedFiles.length === 0 ? (
                    <div className="p-8 text-center text-gray-500">
                      No files indexed yet
                    </div>
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
                            <td className="p-3 text-sm text-gray-500 text-right">
                              {new Date(file.indexed_at).toLocaleDateString()}
                            </td>
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
    </div>
  );
}

export default App;
