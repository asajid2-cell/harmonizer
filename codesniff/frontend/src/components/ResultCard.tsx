import { FileCode, Copy, Eye, CheckCircle, Code2, Package } from 'lucide-react';
import { useState } from 'react';
import { SearchResult } from '../api/client';

interface ResultCardProps {
  result: SearchResult;
  index: number;
  onViewCode: (result: SearchResult) => void;
}

export const ResultCard: React.FC<ResultCardProps> = ({ result, index, onViewCode }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(result.code_snippet);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const getSymbolIcon = () => {
    switch (result.symbol_type) {
      case 'class':
        return <Package className="w-4 h-4" />;
      case 'method':
        return <Code2 className="w-4 h-4" />;
      default:
        return <FileCode className="w-4 h-4" />;
    }
  };

  const similarityPercentage = Math.round(result.similarity_score * 100);

  return (
    <div className="bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-800 rounded-lg overflow-hidden hover:border-gray-300 dark:hover:border-gray-700 transition-colors">
      {/* Header */}
      <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-800">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="p-2 rounded bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400">
              {getSymbolIcon()}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-semibold text-gray-900 dark:text-white truncate">
                {result.symbol_name}
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400 truncate font-mono">
                {result.file_path}:{result.start_line}
              </p>
            </div>
          </div>
          <div className="px-2.5 py-1 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded text-sm font-medium whitespace-nowrap">
            {similarityPercentage}%
          </div>
        </div>

        {/* Metadata */}
        <div className="mt-2 flex items-center gap-3">
          <span className="px-2 py-0.5 bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 rounded text-xs font-medium capitalize">
            {result.symbol_type}
          </span>
          {result.docstring && (
            <span className="text-xs text-gray-600 dark:text-gray-400 truncate">
              {result.docstring}
            </span>
          )}
        </div>
      </div>

      {/* Code preview */}
      <div className="bg-gray-50 dark:bg-black">
        <div className="p-4 overflow-x-auto">
          <pre className="text-sm font-mono text-gray-800 dark:text-gray-200 leading-relaxed">
            <code>{result.code_snippet}</code>
          </pre>
        </div>

        {/* Actions */}
        <div className="px-4 py-2 bg-white dark:bg-gray-900 border-t border-gray-200 dark:border-gray-800 flex items-center justify-between">
          <div className="text-xs text-gray-500 dark:text-gray-400 font-mono">
            Lines {result.start_line}-{result.end_line}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="px-2.5 py-1 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded text-xs font-medium transition-colors flex items-center gap-1.5"
            >
              {copied ? (
                <>
                  <CheckCircle className="w-3.5 h-3.5" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="w-3.5 h-3.5" />
                  Copy
                </>
              )}
            </button>

            <button
              onClick={() => onViewCode(result)}
              className="px-2.5 py-1 text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded text-xs font-medium transition-colors flex items-center gap-1.5"
            >
              <Eye className="w-3.5 h-3.5" />
              View
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ResultCard;
