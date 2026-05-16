import { FileCode, Copy, Eye, CheckCircle, Code2, Package } from 'lucide-react';
import { useState } from 'react';
import { SearchResult } from '../api/client';

interface ResultCardProps {
  result: SearchResult;
  index: number;
  onViewCode: (result: SearchResult) => void;
}

export const ResultCard: React.FC<ResultCardProps> = ({ result, onViewCode }) => {
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
    <div className="result-card">
      <div className="result-card__header">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3 flex-1 min-w-0">
            <div className="result-card__icon">
              {getSymbolIcon()}
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="text-base font-semibold text-white truncate">
                {result.symbol_name}
              </h3>
              <p className="text-sm text-slate-400 truncate font-mono" title={result.file_path}>
                {result.file_path}:{result.start_line}
              </p>
            </div>
          </div>
          <div className="result-card__badge">{similarityPercentage}%</div>
        </div>

        <div className="mt-3 flex items-center gap-3 text-xs text-slate-300">
          <span className="result-card__pill capitalize">{result.symbol_type}</span>
          {result.docstring && (
            <span className="truncate">{result.docstring}</span>
          )}
        </div>
      </div>

      <div className="result-card__body">
        <div className="p-4 overflow-x-auto">
          <pre className="text-sm font-mono text-slate-100 leading-relaxed whitespace-pre-wrap bg-transparent">
            <code>{result.code_snippet}</code>
          </pre>
        </div>

        <div className="result-card__footer">
          <div className="text-xs text-slate-400 font-mono">
            Lines {result.start_line}-{result.end_line}
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleCopy}
              className="result-card__action"
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
              className="result-card__action result-card__action--primary"
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
