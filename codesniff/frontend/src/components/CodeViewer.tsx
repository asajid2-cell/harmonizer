/**
 * Full-screen code viewer modal with Monaco Editor
 */

import { motion, AnimatePresence } from 'framer-motion';
import { X, Copy, ExternalLink, CheckCircle } from 'lucide-react';
import { useState, useEffect } from 'react';
import Editor from '@monaco-editor/react';
import { SearchResult } from '../api/client';

interface CodeViewerProps {
  result: SearchResult | null;
  isOpen: boolean;
  onClose: () => void;
}

export const CodeViewer: React.FC<CodeViewerProps> = ({ result, isOpen, onClose }) => {
  const [copied, setCopied] = useState(false);

  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    if (isOpen) {
      window.addEventListener('keydown', handleEscape);
      return () => window.removeEventListener('keydown', handleEscape);
    }
  }, [isOpen, onClose]);

  const handleCopy = async () => {
    if (!result) return;

    try {
      await navigator.clipboard.writeText(result.code_snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  if (!result) return null;

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[90]"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed inset-4 md:inset-8 z-[100] flex flex-col"
          >
            <div className="relative h-full card-gradient rounded-3xl border border-gray-700 overflow-hidden flex flex-col">
              {/* Header */}
              <div className="relative px-6 py-4 border-b border-gray-800">
                {/* Gradient glow */}
                <div className="absolute inset-0 bg-gradient-to-r from-primary-500/10 to-accent-500/10" />

                <div className="relative flex items-center justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <h2 className="text-2xl font-bold bg-gradient-to-r from-primary-400 to-accent-500 bg-clip-text text-transparent truncate">
                      {result.symbol_name}
                    </h2>
                    <p className="text-sm text-gray-400 truncate mt-1">
                      {result.file_path}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    {/* Type badge */}
                    <span className="px-3 py-1.5 bg-gray-800 border border-gray-700 rounded-lg text-sm font-medium text-gray-300 capitalize">
                      {result.symbol_type}
                    </span>

                    {/* Similarity badge */}
                    <span className="px-3 py-1.5 bg-gradient-to-r from-primary-500 to-accent-500 text-white rounded-lg text-sm font-bold">
                      {Math.round(result.similarity_score * 100)}% match
                    </span>

                    {/* Copy button */}
                    <motion.button
                      onClick={handleCopy}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      className="p-2.5 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
                      title="Copy code"
                    >
                      {copied ? (
                        <CheckCircle className="w-5 h-5 text-green-400" />
                      ) : (
                        <Copy className="w-5 h-5 text-gray-400" />
                      )}
                    </motion.button>

                    {/* Close button */}
                    <motion.button
                      onClick={onClose}
                      whileHover={{ scale: 1.05, rotate: 90 }}
                      whileTap={{ scale: 0.95 }}
                      className="p-2.5 bg-gray-800 hover:bg-gray-700 rounded-lg transition-colors"
                      title="Close (Esc)"
                    >
                      <X className="w-5 h-5 text-gray-400" />
                    </motion.button>
                  </div>
                </div>

                {/* Docstring */}
                {result.docstring && (
                  <div className="relative mt-3 px-4 py-2 bg-gray-800/50 rounded-lg border border-gray-700">
                    <p className="text-sm text-gray-300 italic">{result.docstring}</p>
                  </div>
                )}
              </div>

              {/* Code editor */}
              <div className="flex-1 min-h-0">
                <Editor
                  height="100%"
                  defaultLanguage="python"
                  value={result.code_snippet}
                  theme="vs-dark"
                  options={{
                    readOnly: true,
                    minimap: { enabled: false },
                    fontSize: 14,
                    lineNumbers: 'on',
                    scrollBeyondLastLine: false,
                    wordWrap: 'on',
                    automaticLayout: true,
                    padding: { top: 16, bottom: 16 },
                    renderLineHighlight: 'all',
                    cursorBlinking: 'smooth',
                    smoothScrolling: true,
                  }}
                />
              </div>

              {/* Footer */}
              <div className="px-6 py-3 border-t border-gray-800 bg-gray-900/50">
                <div className="flex items-center justify-between text-sm text-gray-400">
                  <span>
                    Lines {result.start_line}-{result.end_line}
                  </span>
                  <div className="flex items-center gap-2">
                    <kbd className="px-2 py-1 bg-gray-800 rounded text-xs border border-gray-700">
                      Esc
                    </kbd>
                    <span>to close</span>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
};

export default CodeViewer;
