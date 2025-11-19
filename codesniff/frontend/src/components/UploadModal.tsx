/**
 * Upload Modal for Indexing Code
 */

import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Upload, FolderOpen, Github, Loader2, AlertCircle, CheckCircle } from 'lucide-react';
import { apiClient } from '../api/client';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onIndexComplete: () => void;
}

type UploadMethod = 'folder' | 'zip' | 'github';

export default function UploadModal({ isOpen, onClose, onIndexComplete }: UploadModalProps) {
  const [method, setMethod] = useState<UploadMethod>('folder');
  const [githubUrl, setGithubUrl] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<FileList | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<string>('');
  const [isIndexing, setIsIndexing] = useState(false);
  const [progress, setProgress] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const fileInputRef = useState<HTMLInputElement | null>(null)[0];

  const handleClose = () => {
    if (!isIndexing) {
      setMethod('folder');
      setGithubUrl('');
      setSelectedFiles(null);
      setSelectedFolder('');
      setProgress('');
      setError(null);
      setSuccess(false);
      onClose();
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      setSelectedFiles(files);
      // Get folder name from first file's path
      const firstFile = files[0];
      if ('webkitRelativePath' in firstFile && firstFile.webkitRelativePath) {
        const folderName = firstFile.webkitRelativePath.split('/')[0];
        setSelectedFolder(folderName);
      }
    }
  };

  const handleIndex = async () => {
    setError(null);
    setSuccess(false);
    setIsIndexing(true);

    try {
      if (method === 'github') {
        if (!githubUrl.trim()) {
          setError('Please enter a GitHub repository URL');
          setIsIndexing(false);
          return;
        }

        setProgress('Cloning repository...');
        const response = await apiClient.indexGithubRepo(githubUrl.trim());

        setProgress('Indexing complete!');
        setSuccess(true);

        setTimeout(() => {
          onIndexComplete();
          handleClose();
        }, 2000);
      } else if (method === 'folder' || method === 'zip') {
        if (!selectedFiles || selectedFiles.length === 0) {
          setError('Please select files to upload');
          setIsIndexing(false);
          return;
        }

        setProgress('Uploading files...');
        const response = await apiClient.uploadAndIndex(selectedFiles, method === 'zip');

        setProgress('Indexing complete!');
        setSuccess(true);

        setTimeout(() => {
          onIndexComplete();
          handleClose();
        }, 2000);
      }
    } catch (err: any) {
      console.error('Indexing error:', err);
      setError(err.response?.data?.detail || err.message || 'Failed to index');
      setSuccess(false);
    } finally {
      setIsIndexing(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !isIndexing) {
      handleIndex();
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
          onClick={handleClose}
        >
          <motion.div
            initial={{ scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.9, opacity: 0 }}
            onClick={(e) => e.stopPropagation()}
            className="bg-white dark:bg-[#0d1117] rounded-2xl border border-gray-200 dark:border-gray-800 w-full max-w-2xl overflow-hidden"
          >
            {/* Header */}
            <div className="p-6 border-b border-gray-200 dark:border-gray-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500 rounded-lg">
                  <Upload className="w-5 h-5 text-white" />
                </div>
                <div>
                  <h2 className="text-xl font-bold text-gray-900 dark:text-white">Index Code</h2>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Upload a folder or clone a GitHub repository
                  </p>
                </div>
              </div>
              <button
                onClick={handleClose}
                disabled={isIndexing}
                className="p-1.5 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors disabled:opacity-50"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Content */}
            <div className="p-6 space-y-6">
              {/* Method Selection */}
              <div className="grid grid-cols-3 gap-3">
                <button
                  onClick={() => setMethod('folder')}
                  disabled={isIndexing}
                  className={`p-4 rounded-lg border-2 transition-all ${
                    method === 'folder'
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/10'
                      : 'border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <FolderOpen className={`w-6 h-6 mx-auto mb-2 ${method === 'folder' ? 'text-blue-500' : 'text-gray-400'}`} />
                  <div className="text-sm font-medium text-gray-900 dark:text-white">Folder</div>
                  <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">Upload folder</div>
                </button>

                <button
                  onClick={() => setMethod('zip')}
                  disabled={isIndexing}
                  className={`p-4 rounded-lg border-2 transition-all ${
                    method === 'zip'
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/10'
                      : 'border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <Upload className={`w-6 h-6 mx-auto mb-2 ${method === 'zip' ? 'text-blue-500' : 'text-gray-400'}`} />
                  <div className="text-sm font-medium text-gray-900 dark:text-white">ZIP File</div>
                  <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">Upload archive</div>
                </button>

                <button
                  onClick={() => setMethod('github')}
                  disabled={isIndexing}
                  className={`p-4 rounded-lg border-2 transition-all ${
                    method === 'github'
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-500/10'
                      : 'border-gray-200 dark:border-gray-800 hover:border-gray-300 dark:hover:border-gray-700'
                  } disabled:opacity-50 disabled:cursor-not-allowed`}
                >
                  <Github className={`w-6 h-6 mx-auto mb-2 ${method === 'github' ? 'text-blue-500' : 'text-gray-400'}`} />
                  <div className="text-sm font-medium text-gray-900 dark:text-white">GitHub</div>
                  <div className="text-xs text-gray-600 dark:text-gray-400 mt-1">Clone repo</div>
                </button>
              </div>

              {/* Input Field */}
              <div>
                {method === 'github' ? (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      GitHub Repository URL
                    </label>
                    <input
                      type="text"
                      value={githubUrl}
                      onChange={(e) => setGithubUrl(e.target.value)}
                      onKeyPress={handleKeyPress}
                      placeholder="https://github.com/username/repo"
                      disabled={isIndexing}
                      className="w-full px-4 py-2.5 bg-white dark:bg-[#0d1117] border border-gray-300 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
                    />
                    <p className="text-xs text-gray-500 dark:text-gray-400 mt-2">
                      Supports public repositories and private repos with authentication
                    </p>
                  </div>
                ) : method === 'zip' ? (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Select ZIP File
                    </label>
                    <input
                      type="file"
                      accept=".zip"
                      onChange={handleFileSelect}
                      disabled={isIndexing}
                      className="hidden"
                      id="zip-upload"
                    />
                    <label
                      htmlFor="zip-upload"
                      className="block w-full px-4 py-3 bg-white dark:bg-[#0d1117] border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg text-center cursor-pointer hover:border-blue-500 dark:hover:border-blue-500 transition-colors"
                    >
                      <Upload className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {selectedFiles && selectedFiles.length > 0
                          ? selectedFiles[0].name
                          : 'Click to select ZIP file'}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Upload a compressed archive of your project
                      </p>
                    </label>
                  </div>
                ) : (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                      Select Folder
                    </label>
                    <input
                      type="file"
                      /* @ts-ignore */
                      webkitdirectory=""
                      directory=""
                      multiple
                      onChange={handleFileSelect}
                      disabled={isIndexing}
                      className="hidden"
                      id="folder-upload"
                    />
                    <label
                      htmlFor="folder-upload"
                      className="block w-full px-4 py-3 bg-white dark:bg-[#0d1117] border-2 border-dashed border-gray-300 dark:border-gray-700 rounded-lg text-center cursor-pointer hover:border-blue-500 dark:hover:border-blue-500 transition-colors"
                    >
                      <FolderOpen className="w-8 h-8 mx-auto mb-2 text-gray-400" />
                      <p className="text-sm font-medium text-gray-900 dark:text-white">
                        {selectedFolder
                          ? `${selectedFolder} (${selectedFiles?.length || 0} files)`
                          : 'Click to select folder'}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                        Choose a folder containing your project files
                      </p>
                    </label>
                  </div>
                )}
              </div>

              {/* Progress */}
              {progress && (
                <div className="p-4 bg-blue-50 dark:bg-blue-500/10 border border-blue-200 dark:border-blue-500/30 rounded-lg">
                  <div className="flex items-center gap-3">
                    {isIndexing ? (
                      <Loader2 className="w-5 h-5 text-blue-500 animate-spin flex-shrink-0" />
                    ) : success ? (
                      <CheckCircle className="w-5 h-5 text-green-500 flex-shrink-0" />
                    ) : null}
                    <p className="text-sm text-blue-900 dark:text-blue-200">{progress}</p>
                  </div>
                </div>
              )}

              {/* Error */}
              {error && (
                <div className="p-4 bg-red-50 dark:bg-red-900/10 border border-red-200 dark:border-red-900/50 rounded-lg">
                  <div className="flex items-start gap-3">
                    <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
                    <div>
                      <h3 className="text-red-900 dark:text-red-200 font-medium mb-1">Failed to index</h3>
                      <p className="text-red-700 dark:text-red-300 text-sm">{error}</p>
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-6 border-t border-gray-200 dark:border-gray-800 flex items-center justify-between">
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Only Python and JavaScript/TypeScript files will be indexed
              </p>
              <div className="flex gap-3">
                <button
                  onClick={handleClose}
                  disabled={isIndexing}
                  className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={handleIndex}
                  disabled={
                    isIndexing ||
                    (method === 'github' && !githubUrl.trim()) ||
                    ((method === 'folder' || method === 'zip') && (!selectedFiles || selectedFiles.length === 0))
                  }
                  className="px-6 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {isIndexing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Indexing...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4" />
                      Index
                    </>
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
