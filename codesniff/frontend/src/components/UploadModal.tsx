/**
 * Upload Modal for Indexing Code
 */

import { useRef, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Upload, FolderOpen, Github, Loader2, AlertCircle, CheckCircle, Info } from 'lucide-react';
import { apiClient, JobResponse } from '../api/client';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onIndexComplete: () => void;
}

type UploadMethod = 'folder' | 'zip' | 'github';

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const describeJob = (job: JobResponse): string => {
  if (job.status === 'running' && job.cancel_requested) {
    return `Cancel requested; stopping after the current indexing step... ${job.files_indexed || 0} files, ${job.symbols_indexed || 0} symbols.`;
  }
  if (job.status === 'queued') {
    return 'Queued for fast indexing.';
  }
  if (job.status === 'canceled') {
    return job.files_indexed > 0 || job.files_seen > 0
      ? 'Canceled. Partial indexing work was discarded.'
      : 'Canceled before indexing started.';
  }
  if (job.status === 'failed') {
    return job.error ? `Indexing failed: ${job.error}` : 'Indexing failed.';
  }
  if (job.status === 'complete') {
    return `Searchable now: ${job.files_indexed} files and ${job.symbols_indexed} symbols indexed.`;
  }

  const phaseLabel: Record<string, string> = {
    cloning: 'Cloning repository',
    cleaning: 'Removing generated and vendor files',
    fast_indexing: 'Building lexical symbol index',
    queued_after_restart: 'Requeued after service restart',
    lexical_ready: 'Searchable now',
  };

  return `${phaseLabel[job.phase] || job.phase}... ${job.files_indexed || 0} files, ${job.symbols_indexed || 0} symbols.`;
};

export default function UploadModal({ isOpen, onClose, onIndexComplete }: UploadModalProps) {
  const [method, setMethod] = useState<UploadMethod>('folder');
  const [githubUrl, setGithubUrl] = useState('');
  const [selectedFiles, setSelectedFiles] = useState<FileList | null>(null);
  const [selectedFolder, setSelectedFolder] = useState<string>('');
  const [isIndexing, setIsIndexing] = useState(false);
  const [progress, setProgress] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [showInfoTooltip, setShowInfoTooltip] = useState(false);
  const [currentJob, setCurrentJob] = useState<JobResponse | null>(null);
  const [isCancelingJob, setIsCancelingJob] = useState(false);
  const cancelRequestedRef = useRef(false);

  const handleClose = () => {
    // Allow closing even while indexing (background operation)
    setMethod('folder');
    setGithubUrl('');
    setSelectedFiles(null);
    setSelectedFolder('');
    setProgress('');
    setError(null);
    setSuccess(false);
    setCurrentJob(null);
    setIsCancelingJob(false);
    cancelRequestedRef.current = false;
    onClose();
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
    setCurrentJob(null);
    setIsCancelingJob(false);
    cancelRequestedRef.current = false;

    try {
      if (method === 'github') {
        if (!githubUrl.trim()) {
          setError('Please enter a GitHub repository URL');
          setIsIndexing(false);
          return;
        }

        setProgress('Queueing repository for fast indexing...');
        const queued = await apiClient.queueGithubRepo(githubUrl.trim());
        setCurrentJob(queued.job);
        setProgress(describeJob(queued.job));

        let job = queued.job;
        while (job.status === 'queued' || job.status === 'running') {
          await wait(2000);
          job = await apiClient.getJob(job.id);
          setCurrentJob(job);
          setProgress(describeJob(job));
        }

        if (job.status === 'canceled') {
          setProgress(describeJob(job));
          return;
        }
        if (job.status === 'failed') {
          throw new Error(job.error || 'Indexing failed');
        }

        setSuccess(true);
        onIndexComplete();
      } else if (method === 'folder' || method === 'zip') {
        if (!selectedFiles || selectedFiles.length === 0) {
          setError('Please select files to upload');
          setIsIndexing(false);
          return;
        }

        const uploadName = method === 'zip'
          ? selectedFiles[0].name.replace(/\.zip$/i, '') || 'upload'
          : selectedFolder || selectedFiles[0]?.name || 'upload';

        setProgress('Uploading source into cold repo storage...');
        const queued = await apiClient.queueUploadedRepo(selectedFiles, method === 'zip', uploadName);
        setCurrentJob(queued.job);
        setProgress(describeJob(queued.job));

        let job = queued.job;
        while (job.status === 'queued' || job.status === 'running') {
          await wait(2000);
          job = await apiClient.getJob(job.id);
          setCurrentJob(job);
          setProgress(describeJob(job));
        }

        if (job.status === 'canceled') {
          setProgress(describeJob(job));
          return;
        }
        if (job.status === 'failed') {
          throw new Error(job.error || 'Indexing failed');
        }

        setSuccess(true);
        onIndexComplete();
      }
    } catch (err: any) {
      console.error('Indexing error:', err);
      setError(err.response?.data?.detail || err.message || 'Failed to index');
      setSuccess(false);
    } finally {
      setIsIndexing(false);
    }
  };

  const handleCancelJob = async () => {
    if (!currentJob || (currentJob.status !== 'queued' && currentJob.status !== 'running')) {
      return;
    }

    setIsCancelingJob(true);
    setError(null);
    try {
      const canceled = await apiClient.cancelJob(currentJob.id);
      setCurrentJob(canceled);
      setProgress(describeJob(canceled));
      cancelRequestedRef.current = canceled.cancel_requested || canceled.status === 'canceled';
      if (canceled.status === 'canceled') {
        setSuccess(false);
        setIsIndexing(false);
        onIndexComplete();
        return;
      }
      if (canceled.status === 'complete') {
        setSuccess(true);
        setIsIndexing(false);
        onIndexComplete();
        return;
      }
    } catch (err: any) {
      cancelRequestedRef.current = false;
      setError(err.response?.data?.detail || err.message || 'Failed to cancel job');
      try {
        const refreshed = await apiClient.getJob(currentJob.id);
        setCurrentJob(refreshed);
        setProgress(describeJob(refreshed));
        if (refreshed.status === 'complete') {
          setSuccess(true);
          setIsIndexing(false);
          onIndexComplete();
        } else if (refreshed.status === 'failed' || refreshed.status === 'canceled') {
          setSuccess(false);
          setIsIndexing(false);
          onIndexComplete();
        } else {
          setIsIndexing(true);
        }
      } catch {
        setIsIndexing(true);
      }
    } finally {
      setIsCancelingJob(false);
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
                  data-ui="upload-method-folder"
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
                  data-ui="upload-method-zip"
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
                  data-ui="upload-method-github"
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
                    <p className="text-sm text-blue-900 dark:text-blue-200 flex-1">{progress}</p>
                    {isIndexing && currentJob && (currentJob.status === 'queued' || currentJob.status === 'running') && (
                      <button
                        data-ui="upload-cancel-job"
                        type="button"
                        onClick={handleCancelJob}
                        disabled={isCancelingJob || currentJob.cancel_requested}
                        className="rounded-md border border-blue-300/40 px-3 py-2 text-xs font-medium uppercase tracking-[0.16em] text-blue-800 transition-colors hover:border-blue-400 hover:bg-blue-100 disabled:cursor-wait disabled:opacity-60 dark:text-blue-100 dark:hover:bg-blue-400/10"
                      >
                        {currentJob.cancel_requested ? 'Cancel requested' : isCancelingJob ? 'Canceling' : 'Cancel job'}
                      </button>
                    )}
                    {isIndexing && (
                      <div className="relative">
                        <button
                          type="button"
                          onMouseEnter={() => setShowInfoTooltip(true)}
                          onMouseLeave={() => setShowInfoTooltip(false)}
                          className="p-1 text-blue-500 hover:text-blue-600 transition-colors"
                        >
                          <Info className="w-4 h-4" />
                        </button>
                        {showInfoTooltip && (
                          <div className="absolute right-0 bottom-full mb-2 w-80 p-3 bg-gray-900 text-white text-xs rounded-lg shadow-xl z-50">
                            <div className="font-semibold mb-1">Indexing Process</div>
                            <div className="space-y-1 text-gray-300">
                              <p>Fast indexing builds a lexical symbol index first.</p>
                              <p>Semantic vectors are optional and should not block search.</p>
                              <p>Status comes from the backend job record.</p>
                              <p className="mt-2 pt-2 border-t border-gray-700">When the job says searchable, keyword and symbol search can run even if vectors are not ready.</p>
                            </div>
                            <div className="absolute bottom-0 right-4 transform translate-y-1/2 rotate-45 w-2 h-2 bg-gray-900"></div>
                          </div>
                        )}
                      </div>
                    )}
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
                {isIndexing
                  ? "Fast indexing stores a cold repo artifact and reports real job status"
                  : "Supports common Python, web, JVM, C-family, Go, Rust, Ruby, PHP, shell, SQL, and shader files"
                }
              </p>
              <div className="flex gap-3">
                <button
                  onClick={handleClose}
                  className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
                >
                  {isIndexing ? 'Close' : 'Cancel'}
                </button>
                <button
                  data-ui="upload-submit"
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
