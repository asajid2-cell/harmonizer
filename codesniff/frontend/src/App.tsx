/**
 * CodeSniff Main Application
 */

import { useState, useEffect, useRef, type FormEvent } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Activity, AlertCircle, BellRing, Bot, CreditCard, Flag, FolderOpen, Trash2, X, MessageCircle, Upload, ChevronDown, Check, Zap, Wrench, BookOpen, Settings, Play, FolderTree, FileCode2, ClipboardList, Package, Terminal, RotateCw, GitBranch, Database, Clock3, Gauge, HardDrive, ShieldCheck } from 'lucide-react';
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
import { SearchResult, IndexedFile, RepoResponse, JobResponse, RepoOverviewResponse, RepoFactsResponse, RepoRelationshipsResponse, RepoTeachingResponse, RepoTeachingQueryResponse, RepoSearchQualityResponse, RepoSearchQualityBaseline, RepoStorageProfileResponse, RepoFileContentResponse, RepoModuleDetailResponse, apiClient } from './api/client';

const HERO_EXAMPLES = [
  { label: 'Find functions that parse JSON', query: 'functions that parse JSON' },
  { label: 'Trace async data loaders', query: 'async functions that fetch data' },
  { label: 'Locate authentication middleware', query: 'authentication middleware' },
  { label: 'Search rate limiting logic', query: 'rate limiting logic' },
  { label: 'Inspect pagination helpers', query: 'pagination helpers' },
  { label: 'Find JWT token generation', query: 'JWT token generation' },
  { label: 'Search file upload handlers', query: 'code that handles file uploads' },
  { label: 'Map database connectors', query: 'code that connects to database' },
];

const FACT_KIND_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'index_fallback', label: 'Index' },
  { value: 'search_quality', label: 'Quality' },
  { value: 'runbook_command', label: 'Runbook' },
  { value: 'cli_command', label: 'CLI' },
  { value: 'test_system', label: 'Tests' },
  { value: 'release_process', label: 'Release' },
  { value: 'quality_tool', label: 'Checks' },
  { value: 'dev_environment', label: 'Dev Env' },
  { value: 'build_system', label: 'Build' },
  { value: 'workspace', label: 'Workspaces' },
  { value: 'route_endpoint', label: 'Routes' },
  { value: 'api_contract', label: 'API Specs' },
  { value: 'ui_surface', label: 'UI' },
  { value: 'mobile_surface', label: 'Mobile' },
  { value: 'dependency', label: 'Deps' },
  { value: 'stack_component', label: 'Stack' },
  { value: 'service_integration', label: 'Integrations' },
  { value: 'graphql_surface', label: 'GraphQL' },
  { value: 'message_bus', label: 'Events' },
  { value: 'data_store', label: 'Stores' },
  { value: 'ai_surface', label: 'AI' },
  { value: 'payment_surface', label: 'Billing' },
  { value: 'auth_surface', label: 'Auth' },
  { value: 'background_job', label: 'Jobs' },
  { value: 'webhook_surface', label: 'Webhooks' },
  { value: 'observability_surface', label: 'Observe' },
  { value: 'feature_flag', label: 'Flags' },
  { value: 'notification_surface', label: 'Notify' },
  { value: 'schema', label: 'Data' },
  { value: 'migration', label: 'Migrate' },
  { value: 'env_var', label: 'Env' },
  { value: 'secret_signal', label: 'Secrets' },
  { value: 'ci_workflow', label: 'CI' },
  { value: 'container_service', label: 'Services' },
  { value: 'runtime_requirement', label: 'Runtime' },
  { value: 'infra_resource', label: 'Infra' },
  { value: 'supply_chain', label: 'Supply' },
  { value: 'deploy_target', label: 'Deploy' },
  { value: 'repo_policy', label: 'Policy' },
  { value: 'code_owner', label: 'Owners' },
  { value: 'module', label: 'Modules' },
  { value: 'module_dependency', label: 'Mod Deps' },
  { value: 'doc_section', label: 'Docs' },
  { value: 'architecture_decision', label: 'ADRs' },
  { value: 'import', label: 'Imports' },
  { value: 'config', label: 'Config' },
  { value: 'test', label: 'Tests' },
];

const RELATIONSHIP_TYPE_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'imports', label: 'Imports' },
  { value: 'exports', label: 'Exports' },
  { value: 'calls', label: 'Calls' },
  { value: 'references', label: 'Refs' },
  { value: 'defines_route', label: 'Routes' },
  { value: 'defines_schema', label: 'Data' },
  { value: 'defines_migration', label: 'Migrate' },
  { value: 'depends_on_module', label: 'Modules' },
  { value: 'tests', label: 'Tests' },
  { value: 'configures', label: 'Config' },
  { value: 'mentions', label: 'Mentions' },
];

const REFRESH_SCHEDULE_OPTIONS = [
  { value: 0, label: 'Manual' },
  { value: 60, label: '1h' },
  { value: 360, label: '6h' },
  { value: 1440, label: 'Daily' },
  { value: 10080, label: 'Weekly' },
];

const factCacheKey = (repoId: number, kind: string) => `${repoId}:${kind || 'all'}`;
const relationshipCacheKey = (repoId: number, relType: string) => `${repoId}:${relType || 'all'}`;
const moduleDetailCacheKey = (repoId: number, modulePath: string) => `${repoId}:${modulePath}`;

const formatFactKind = (kind: string) => kind.replace(/_/g, ' ');
const formatRelationshipType = (relType: string) => relType.replace(/_/g, ' ');
const formatRelationshipMeta = (metadata: Record<string, unknown> | null | undefined) => {
  const seen = new Set<string>();
  const values = ['framework', 'syntax', 'schema_type', 'source', 'action', 'operation', 'model', 'table', 'field', 'target_model', 'target_table', 'source_module', 'target_module', 'import_count', 'relation_type', 'foreign_key', 'references', 'inverse', 'through', 'column', 'name', 'exported_as', 'symbol_type', 'tool', 'caller', 'target_path', 'target_resolution', 'match', 'detail']
    .map((key) => metadata?.[key])
    .filter((value): value is string | number => (typeof value === 'string' && value.trim().length > 0) || typeof value === 'number')
    .map((value) => String(value))
    .filter((value) => {
      if (seen.has(value)) {
        return false;
      }
      seen.add(value);
      return true;
    });

  return values.join(' - ');
};

const formatBytes = (bytes: number = 0) => {
  if (!bytes) {
    return '0 B';
  }

  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  let value = bytes;
  let unitIndex = 0;

  while (value >= 1024 && unitIndex < units.length - 1) {
    value /= 1024;
    unitIndex += 1;
  }

  const precision = value >= 10 || unitIndex === 0 ? 0 : 1;
  return `${value.toFixed(precision)} ${units[unitIndex]}`;
};

const formatScheduleInterval = (minutes?: number | null) => {
  if (!minutes || minutes <= 0) {
    return 'Manual';
  }
  if (minutes % 10080 === 0) {
    const weeks = minutes / 10080;
    return weeks === 1 ? 'Weekly' : `${weeks}w`;
  }
  if (minutes % 1440 === 0) {
    const days = minutes / 1440;
    return days === 1 ? 'Daily' : `${days}d`;
  }
  if (minutes % 60 === 0) {
    return `${minutes / 60}h`;
  }
  return `${minutes}m`;
};

const formatScheduleTitle = (repo: RepoResponse) => {
  if (!repo.refresh_interval_minutes) {
    return 'Scheduled refresh disabled';
  }
  if (!repo.next_refresh_at) {
    return `Refresh every ${formatScheduleInterval(repo.refresh_interval_minutes)}`;
  }
  const next = new Date(repo.next_refresh_at);
  const nextLabel = Number.isNaN(next.getTime()) ? repo.next_refresh_at : next.toLocaleString();
  return `Refresh every ${formatScheduleInterval(repo.refresh_interval_minutes)}; next ${nextLabel}`;
};

const formatQualityPercent = (value: number) => `${Math.round((value || 0) * 100)}%`;
const normalizeQualityDelta = (value?: number | null) => {
  if (value === null || value === undefined || !Number.isFinite(value)) {
    return null;
  }
  return Math.abs(value) < 0.0005 ? 0 : value;
};
const formatQualityPercentDelta = (value?: number | null) => {
  const delta = normalizeQualityDelta(value);
  if (delta === null) {
    return 'n/a';
  }
  const points = Math.round(delta * 100);
  return `${points > 0 ? '+' : ''}${points}pp`;
};
const formatQualityNumberDelta = (value?: number | null) => {
  const delta = normalizeQualityDelta(value);
  if (delta === null) {
    return 'n/a';
  }
  return `${delta > 0 ? '+' : ''}${delta.toFixed(2)}`;
};
const formatQualityCountDelta = (value?: number | null) => {
  const delta = normalizeQualityDelta(value);
  if (delta === null) {
    return 'n/a';
  }
  return `${delta > 0 ? '+' : ''}${Math.round(delta)}`;
};
const formatQualityBaselineSummary = (baseline: RepoSearchQualityBaseline) => {
  const parts = [];
  if (baseline.min_recall_at_k !== null && baseline.min_recall_at_k !== undefined) {
    parts.push(`Recall >= ${formatQualityPercent(baseline.min_recall_at_k)} (${formatQualityPercentDelta(baseline.recall_delta)})`);
  }
  if (baseline.min_mrr !== null && baseline.min_mrr !== undefined) {
    parts.push(`MRR >= ${baseline.min_mrr.toFixed(2)} (${formatQualityNumberDelta(baseline.mrr_delta)})`);
  }
  if (baseline.min_passed !== null && baseline.min_passed !== undefined) {
    parts.push(`Cases >= ${baseline.min_passed} (${formatQualityCountDelta(baseline.passed_delta)})`);
  }
  return parts.join(' / ') || 'No baseline thresholds';
};
const formatLanguageSupport = (supportLevel?: string, symbolAware?: boolean) => {
  if (supportLevel === 'mixed') {
    return 'Mixed';
  }
  return symbolAware || supportLevel === 'symbol-aware' ? 'Symbols' : 'Search';
};

const languageSupportClass = (supportLevel?: string, symbolAware?: boolean) => {
  if (supportLevel === 'mixed') {
    return 'border-amber-300/30 bg-amber-400/10 text-amber-100';
  }
  if (symbolAware || supportLevel === 'symbol-aware') {
    return 'border-emerald-300/30 bg-emerald-400/10 text-emerald-100';
  }
  return 'border-blue-300/30 bg-blue-400/10 text-blue-100';
};

function App() {
  const { results, isLoading, error, searchTime, search, clear } = useSearch();
  const { stats, refresh: refetchStats } = useStats(true);
  const [selectedResult, setSelectedResult] = useState<SearchResult | null>(null);
  const [isCodeViewerOpen, setIsCodeViewerOpen] = useState(false);
  const [isFilesModalOpen, setIsFilesModalOpen] = useState(false);
  const [indexedFiles, setIndexedFiles] = useState<IndexedFile[]>([]);
  const [isLoadingFiles, setIsLoadingFiles] = useState(false);
  const [fileBrowserRepo, setFileBrowserRepo] = useState<RepoResponse | null>(null);
  const [selectedRepoFile, setSelectedRepoFile] = useState<RepoFileContentResponse | null>(null);
  const [isLoadingRepoFile, setIsLoadingRepoFile] = useState(false);
  const [fileBrowserError, setFileBrowserError] = useState<string | null>(null);
  const [isClearing, setIsClearing] = useState(false);
  const [resultsLimit, setResultsLimit] = useState(20);
  const [hasSearched, setHasSearched] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [selectedLanguages, setSelectedLanguages] = useState<string[]>([]);
  const [isLanguageDropdownOpen, setIsLanguageDropdownOpen] = useState(false);
  const [repos, setRepos] = useState<RepoResponse[]>([]);
  const [selectedRepoId, setSelectedRepoId] = useState<number | null>(null);
  const [semanticJobs, setSemanticJobs] = useState<Record<number, JobResponse>>({});
  const [deepJobs, setDeepJobs] = useState<Record<number, JobResponse>>({});
  const [repoActions, setRepoActions] = useState<Record<number, 'delete' | 'repair' | 'refresh' | 'schedule' | 'enrich'>>({});
  const [repoOverviews, setRepoOverviews] = useState<Record<number, RepoOverviewResponse>>({});
  const [overviewErrors, setOverviewErrors] = useState<Record<number, string>>({});
  const [loadingOverviewRepoId, setLoadingOverviewRepoId] = useState<number | null>(null);
  const [repoFacts, setRepoFacts] = useState<Record<string, RepoFactsResponse>>({});
  const [factErrors, setFactErrors] = useState<Record<string, string>>({});
  const [loadingFactsKey, setLoadingFactsKey] = useState<string | null>(null);
  const [selectedFactKind, setSelectedFactKind] = useState('');
  const [repoRelationships, setRepoRelationships] = useState<Record<string, RepoRelationshipsResponse>>({});
  const [relationshipErrors, setRelationshipErrors] = useState<Record<string, string>>({});
  const [loadingRelationshipsKey, setLoadingRelationshipsKey] = useState<string | null>(null);
  const [selectedRelationshipType, setSelectedRelationshipType] = useState('');
  const [repoTeaching, setRepoTeaching] = useState<Record<number, RepoTeachingResponse>>({});
  const [teachingErrors, setTeachingErrors] = useState<Record<number, string>>({});
  const [loadingTeachingRepoId, setLoadingTeachingRepoId] = useState<number | null>(null);
  const [teachingQuestion, setTeachingQuestion] = useState('');
  const [repoTeachingQueries, setRepoTeachingQueries] = useState<Record<number, RepoTeachingQueryResponse>>({});
  const [teachingQueryErrors, setTeachingQueryErrors] = useState<Record<number, string>>({});
  const [loadingTeachingQueryRepoId, setLoadingTeachingQueryRepoId] = useState<number | null>(null);
  const [repoSearchQuality, setRepoSearchQuality] = useState<Record<number, RepoSearchQualityResponse>>({});
  const [searchQualityErrors, setSearchQualityErrors] = useState<Record<number, string>>({});
  const [loadingSearchQualityRepoId, setLoadingSearchQualityRepoId] = useState<number | null>(null);
  const [repoStorageProfiles, setRepoStorageProfiles] = useState<Record<number, RepoStorageProfileResponse>>({});
  const [storageProfileErrors, setStorageProfileErrors] = useState<Record<number, string>>({});
  const [loadingStorageProfileRepoId, setLoadingStorageProfileRepoId] = useState<number | null>(null);
  const [selectedModulePath, setSelectedModulePath] = useState<string | null>(null);
  const [repoModuleDetails, setRepoModuleDetails] = useState<Record<string, RepoModuleDetailResponse>>({});
  const [moduleDetailErrors, setModuleDetailErrors] = useState<Record<string, string>>({});
  const [loadingModuleDetailKey, setLoadingModuleDetailKey] = useState<string | null>(null);
  const languageDropdownRef = useRef<HTMLDivElement>(null);
  const blockingOverlayOpen = isUploadModalOpen || isFilesModalOpen || isCodeViewerOpen;
  const hasSearchableIndex = Boolean(stats?.lexical_ready) || repos.some((repo) => repo.lexical_ready);
  const hasSemanticIndex = Boolean(stats?.semantic_ready) || repos.some((repo) => repo.semantic_ready);
  const selectedRepo = selectedRepoId ? repos.find((repo) => repo.id === selectedRepoId) : undefined;
  const selectedOverview = selectedRepoId ? repoOverviews[selectedRepoId] : undefined;
  const selectedFactsKey = selectedRepoId ? factCacheKey(selectedRepoId, selectedFactKind) : '';
  const selectedRepoFacts = selectedFactsKey ? repoFacts[selectedFactsKey] : undefined;
  const selectedFactError = selectedFactsKey ? factErrors[selectedFactsKey] : undefined;
  const selectedRelationshipsKey = selectedRepoId ? relationshipCacheKey(selectedRepoId, selectedRelationshipType) : '';
  const selectedRepoRelationships = selectedRelationshipsKey ? repoRelationships[selectedRelationshipsKey] : undefined;
  const selectedRelationshipError = selectedRelationshipsKey ? relationshipErrors[selectedRelationshipsKey] : undefined;
  const selectedRepoTeaching = selectedRepoId ? repoTeaching[selectedRepoId] : undefined;
  const selectedTeachingError = selectedRepoId ? teachingErrors[selectedRepoId] : undefined;
  const selectedRepoTeachingQuery = selectedRepoId ? repoTeachingQueries[selectedRepoId] : undefined;
  const selectedTeachingQueryError = selectedRepoId ? teachingQueryErrors[selectedRepoId] : undefined;
  const selectedRepoSearchQuality = selectedRepoId ? repoSearchQuality[selectedRepoId] : undefined;
  const selectedSearchQualityError = selectedRepoId ? searchQualityErrors[selectedRepoId] : undefined;
  const selectedRepoStorageProfile = selectedRepoId ? repoStorageProfiles[selectedRepoId] : undefined;
  const selectedStorageProfileError = selectedRepoId ? storageProfileErrors[selectedRepoId] : undefined;
  const selectedModuleKey = selectedRepoId && selectedModulePath ? moduleDetailCacheKey(selectedRepoId, selectedModulePath) : '';
  const selectedModuleDetail = selectedModuleKey ? repoModuleDetails[selectedModuleKey] : undefined;
  const selectedModuleError = selectedModuleKey ? moduleDetailErrors[selectedModuleKey] : undefined;

  const toggleRepoDetails = (repoId: number) => {
    setSelectedRepoId((currentRepoId) => (currentRepoId === repoId ? null : repoId));
  };

  const handleSearch = async (query: string) => {
    if (query.trim()) {
      setHasSearched(true);
      setSearchQuery(query);
      await search(query, {
        limit: resultsLimit,
        min_similarity: 0.4,
        language_filter: selectedLanguages.length > 0 ? selectedLanguages : undefined,
        repoId: selectedRepoId || undefined,
      });
    } else {
      setHasSearched(false);
      setSearchQuery('');
      clear();
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
    setFileBrowserError(null);
    setSelectedRepoFile(null);
    try {
      const repoForBrowser = selectedRepo?.lexical_ready ? selectedRepo : null;
      const response = repoForBrowser
        ? await apiClient.getRepoFiles(repoForBrowser.id)
        : await apiClient.getFiles();
      setFileBrowserRepo(repoForBrowser);
      setIndexedFiles(response.files);
      setIsFilesModalOpen(true);
    } catch (err) {
      console.error('Failed to load files:', err);
      setFileBrowserRepo(null);
      setIndexedFiles([]);
      setFileBrowserError('Files unavailable');
      setIsFilesModalOpen(true);
    } finally {
      setIsLoadingFiles(false);
    }
  };

  const handleOpenRepoFile = async (file: IndexedFile) => {
    if (!fileBrowserRepo) {
      return;
    }

    setIsLoadingRepoFile(true);
    setFileBrowserError(null);
    try {
      const detail = await apiClient.getRepoFile(fileBrowserRepo.id, file.path);
      setSelectedRepoFile(detail);
    } catch (err) {
      console.error('Failed to load source file:', err);
      setSelectedRepoFile(null);
      setFileBrowserError('Source unavailable for this file');
    } finally {
      setIsLoadingRepoFile(false);
    }
  };

  const handleCloseFilesModal = () => {
    setIsFilesModalOpen(false);
    setFileBrowserError(null);
    setSelectedRepoFile(null);
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
      setSelectedRepoFile(null);
      refetchStats();
    } catch (err) {
      console.error('Failed to clear index:', err);
    } finally {
      setIsClearing(false);
    }
  };

  const handleIndexComplete = () => {
    refetchStats();
    loadRepos();
  };

  const loadRepos = async () => {
    try {
      const response = await apiClient.listRepos();
      setRepos(response);
    } catch (err) {
      console.error('Failed to load repos:', err);
    }
  };

  const loadRepoOverview = async (repo: RepoResponse) => {
    if (!repo.lexical_ready) {
      return;
    }

    setLoadingOverviewRepoId(repo.id);
    try {
      const overview = await apiClient.getRepoOverview(repo.id);
      setRepoOverviews((prev) => ({ ...prev, [repo.id]: overview }));
      setOverviewErrors((prev) => {
        const next = { ...prev };
        delete next[repo.id];
        return next;
      });
    } catch (err) {
      console.error('Failed to load repo overview:', err);
      setOverviewErrors((prev) => ({ ...prev, [repo.id]: 'Overview unavailable' }));
    } finally {
      setLoadingOverviewRepoId((current) => (current === repo.id ? null : current));
    }
  };

  const loadRepoFacts = async (repo: RepoResponse, kind: string = selectedFactKind) => {
    if (!repo.lexical_ready) {
      return;
    }

    const cacheKey = factCacheKey(repo.id, kind);
    setLoadingFactsKey(cacheKey);
    try {
      const facts = await apiClient.getRepoFacts(repo.id, kind || undefined, 80);
      setRepoFacts((prev) => ({ ...prev, [cacheKey]: facts }));
      setFactErrors((prev) => {
        const next = { ...prev };
        delete next[cacheKey];
        return next;
      });
    } catch (err) {
      console.error('Failed to load repo facts:', err);
      setFactErrors((prev) => ({ ...prev, [cacheKey]: 'Facts unavailable' }));
    } finally {
      setLoadingFactsKey((current) => (current === cacheKey ? null : current));
    }
  };

  const loadRepoRelationships = async (repo: RepoResponse, relType: string = selectedRelationshipType) => {
    if (!repo.lexical_ready) {
      return;
    }

    const cacheKey = relationshipCacheKey(repo.id, relType);
    setLoadingRelationshipsKey(cacheKey);
    try {
      const relationships = await apiClient.getRepoRelationships(repo.id, relType || undefined, 80);
      setRepoRelationships((prev) => ({ ...prev, [cacheKey]: relationships }));
      setRelationshipErrors((prev) => {
        const next = { ...prev };
        delete next[cacheKey];
        return next;
      });
    } catch (err) {
      console.error('Failed to load repo relationships:', err);
      setRelationshipErrors((prev) => ({ ...prev, [cacheKey]: 'Relationships unavailable' }));
    } finally {
      setLoadingRelationshipsKey((current) => (current === cacheKey ? null : current));
    }
  };

  const loadRepoTeaching = async (repo: RepoResponse) => {
    if (!repo.lexical_ready) {
      return;
    }

    setLoadingTeachingRepoId(repo.id);
    try {
      const teaching = await apiClient.getRepoTeaching(repo.id);
      setRepoTeaching((prev) => ({ ...prev, [repo.id]: teaching }));
      setTeachingErrors((prev) => {
        const next = { ...prev };
        delete next[repo.id];
        return next;
      });
    } catch (err) {
      console.error('Failed to load repo guide:', err);
      setTeachingErrors((prev) => ({ ...prev, [repo.id]: 'Guide unavailable' }));
    } finally {
      setLoadingTeachingRepoId((current) => (current === repo.id ? null : current));
    }
  };

  const handleAskRepoTeaching = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const repo = selectedRepo;
    const question = teachingQuestion.trim();
    if (!repo || !repo.lexical_ready || question.length < 2) {
      return;
    }

    setLoadingTeachingQueryRepoId(repo.id);
    try {
      const answer = await apiClient.getRepoTeachingQuery(repo.id, question, 6);
      setRepoTeachingQueries((prev) => ({ ...prev, [repo.id]: answer }));
      setTeachingQueryErrors((prev) => {
        const next = { ...prev };
        delete next[repo.id];
        return next;
      });
    } catch (err) {
      console.error('Failed to answer repo question:', err);
      setTeachingQueryErrors((prev) => ({ ...prev, [repo.id]: 'Question evidence unavailable' }));
    } finally {
      setLoadingTeachingQueryRepoId((current) => (current === repo.id ? null : current));
    }
  };

  const handleRunSearchQuality = async (repo: RepoResponse) => {
    if (!repo.lexical_ready) {
      return;
    }

    setLoadingSearchQualityRepoId(repo.id);
    try {
      const report = await apiClient.getRepoSearchQuality(repo.id, 8, 5);
      setRepoSearchQuality((prev) => ({ ...prev, [repo.id]: report }));
      setSearchQualityErrors((prev) => {
        const next = { ...prev };
        delete next[repo.id];
        return next;
      });
    } catch (err) {
      console.error('Failed to run search quality check:', err);
      setSearchQualityErrors((prev) => ({ ...prev, [repo.id]: 'Quality check unavailable' }));
    } finally {
      setLoadingSearchQualityRepoId((current) => (current === repo.id ? null : current));
    }
  };

  const handleLoadStorageProfile = async (repo: RepoResponse) => {
    if (!repo.lexical_ready) {
      return;
    }

    setLoadingStorageProfileRepoId(repo.id);
    try {
      const profile = await apiClient.getRepoStorageProfile(repo.id, 5);
      setRepoStorageProfiles((prev) => ({ ...prev, [repo.id]: profile }));
      setStorageProfileErrors((prev) => {
        const next = { ...prev };
        delete next[repo.id];
        return next;
      });
    } catch (err) {
      console.error('Failed to load storage profile:', err);
      setStorageProfileErrors((prev) => ({ ...prev, [repo.id]: 'Storage profile unavailable' }));
    } finally {
      setLoadingStorageProfileRepoId((current) => (current === repo.id ? null : current));
    }
  };

  const loadRepoModuleDetail = async (repo: RepoResponse, modulePath: string) => {
    if (!repo.lexical_ready) {
      return;
    }

    const cacheKey = moduleDetailCacheKey(repo.id, modulePath);
    setLoadingModuleDetailKey(cacheKey);
    try {
      const detail = await apiClient.getRepoModuleDetail(repo.id, modulePath);
      setRepoModuleDetails((prev) => ({ ...prev, [cacheKey]: detail }));
      setModuleDetailErrors((prev) => {
        const next = { ...prev };
        delete next[cacheKey];
        return next;
      });
    } catch (err) {
      console.error('Failed to load module detail:', err);
      setModuleDetailErrors((prev) => ({ ...prev, [cacheKey]: 'Module detail unavailable' }));
    } finally {
      setLoadingModuleDetailKey((current) => (current === cacheKey ? null : current));
    }
  };

  const clearRepoFactCache = (repoId: number) => {
    const prefix = `${repoId}:`;
    setRepoFacts((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((key) => {
        if (key.startsWith(prefix)) {
          delete next[key];
        }
      });
      return next;
    });
    setFactErrors((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((key) => {
        if (key.startsWith(prefix)) {
          delete next[key];
        }
      });
      return next;
    });
    setLoadingFactsKey((current) => (current?.startsWith(prefix) ? null : current));
  };

  const clearRepoRelationshipCache = (repoId: number) => {
    const prefix = `${repoId}:`;
    setRepoRelationships((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((key) => {
        if (key.startsWith(prefix)) {
          delete next[key];
        }
      });
      return next;
    });
    setRelationshipErrors((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((key) => {
        if (key.startsWith(prefix)) {
          delete next[key];
        }
      });
      return next;
    });
    setLoadingRelationshipsKey((current) => (current?.startsWith(prefix) ? null : current));
  };

  const clearRepoTeachingCache = (repoId: number) => {
    setRepoTeaching((prev) => {
      const next = { ...prev };
      delete next[repoId];
      return next;
    });
    setTeachingErrors((prev) => {
      const next = { ...prev };
      delete next[repoId];
      return next;
    });
    setLoadingTeachingRepoId((current) => (current === repoId ? null : current));
    setRepoTeachingQueries((prev) => {
      const next = { ...prev };
      delete next[repoId];
      return next;
    });
    setTeachingQueryErrors((prev) => {
      const next = { ...prev };
      delete next[repoId];
      return next;
    });
    setLoadingTeachingQueryRepoId((current) => (current === repoId ? null : current));
  };

  const clearRepoSearchQualityCache = (repoId: number) => {
    setRepoSearchQuality((prev) => {
      const next = { ...prev };
      delete next[repoId];
      return next;
    });
    setSearchQualityErrors((prev) => {
      const next = { ...prev };
      delete next[repoId];
      return next;
    });
    setLoadingSearchQualityRepoId((current) => (current === repoId ? null : current));
  };

  const clearRepoStorageProfileCache = (repoId: number) => {
    setRepoStorageProfiles((prev) => {
      const next = { ...prev };
      delete next[repoId];
      return next;
    });
    setStorageProfileErrors((prev) => {
      const next = { ...prev };
      delete next[repoId];
      return next;
    });
    setLoadingStorageProfileRepoId((current) => (current === repoId ? null : current));
  };

  const clearRepoModuleDetailCache = (repoId: number) => {
    const prefix = `${repoId}:`;
    setRepoModuleDetails((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((key) => {
        if (key.startsWith(prefix)) {
          delete next[key];
        }
      });
      return next;
    });
    setModuleDetailErrors((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((key) => {
        if (key.startsWith(prefix)) {
          delete next[key];
        }
      });
      return next;
    });
    setLoadingModuleDetailKey((current) => (current?.startsWith(prefix) ? null : current));
    setSelectedModulePath((current) => (selectedRepoId === repoId ? null : current));
  };

  const clearRepoWorkbenchCache = (repoId: number) => {
    setRepoOverviews((prev) => {
      const next = { ...prev };
      delete next[repoId];
      return next;
    });
    setOverviewErrors((prev) => {
      const next = { ...prev };
      delete next[repoId];
      return next;
    });
    clearRepoFactCache(repoId);
    clearRepoRelationshipCache(repoId);
    clearRepoTeachingCache(repoId);
    clearRepoSearchQualityCache(repoId);
    clearRepoStorageProfileCache(repoId);
    clearRepoModuleDetailCache(repoId);
  };

  const handleWarmSemantics = async (repo: RepoResponse) => {
    try {
      const response = await apiClient.warmRepoSemantic(repo.id);
      setSemanticJobs((prev) => ({ ...prev, [repo.id]: response.job }));
      await loadRepos();
    } catch (err) {
      console.error('Failed to queue semantic warmup:', err);
    }
  };

  const handleEnrichRepo = async (repo: RepoResponse) => {
    setRepoActions((prev) => ({ ...prev, [repo.id]: 'enrich' }));
    try {
      const response = await apiClient.enrichRepo(repo.id);
      setRepos((prev) => prev.map((item) => (item.id === repo.id ? response.repo : item)));
      setDeepJobs((prev) => ({ ...prev, [repo.id]: response.job }));
      await loadRepos();
    } catch (err) {
      console.error('Failed to queue deep enrichment:', err);
    } finally {
      setRepoActions((prev) => {
        const next = { ...prev };
        delete next[repo.id];
        return next;
      });
    }
  };

  const handleCancelDeepJob = async (job: JobResponse) => {
    try {
      const canceled = await apiClient.cancelJob(job.id);
      if (canceled.status === 'queued' || canceled.status === 'running') {
        setDeepJobs((prev) => ({ ...prev, [canceled.repo_id]: canceled }));
      } else {
        setDeepJobs((prev) => {
          const next = { ...prev };
          delete next[job.repo_id];
          return next;
        });
      }
      await loadRepos();
    } catch (err) {
      console.error('Failed to cancel deep enrichment:', err);
    }
  };

  const handleCancelSemanticJob = async (job: JobResponse) => {
    try {
      const canceled = await apiClient.cancelJob(job.id);
      if (canceled.status === 'queued' || canceled.status === 'running') {
        setSemanticJobs((prev) => ({ ...prev, [canceled.repo_id]: canceled }));
      } else {
        setSemanticJobs((prev) => {
          const next = { ...prev };
          delete next[job.repo_id];
          return next;
        });
      }
      await loadRepos();
    } catch (err) {
      console.error('Failed to cancel semantic job:', err);
    }
  };

  const handleRepairSemantics = async (repo: RepoResponse) => {
    setRepoActions((prev) => ({ ...prev, [repo.id]: 'repair' }));
    try {
      const repaired = await apiClient.repairRepoSemantic(repo.id);
      setRepos((prev) => prev.map((item) => (item.id === repo.id ? repaired : item)));
      setSemanticJobs((prev) => {
        const next = { ...prev };
        delete next[repo.id];
        return next;
      });
      await loadRepos();
    } catch (err) {
      console.error('Failed to repair semantic artifacts:', err);
    } finally {
      setRepoActions((prev) => {
        const next = { ...prev };
        delete next[repo.id];
        return next;
      });
    }
  };

  const handleRefreshRepo = async (repo: RepoResponse) => {
    setRepoActions((prev) => ({ ...prev, [repo.id]: 'refresh' }));
    try {
      const response = await apiClient.refreshRepo(repo.id);
      setRepos((prev) => prev.map((item) => (item.id === repo.id ? response.repo : item)));
      setSemanticJobs((prev) => {
        const next = { ...prev };
        delete next[repo.id];
        return next;
      });
      setDeepJobs((prev) => {
        const next = { ...prev };
        delete next[repo.id];
        return next;
      });
      clearRepoWorkbenchCache(repo.id);
      await loadRepos();
    } catch (err) {
      console.error('Failed to refresh repo:', err);
    } finally {
      setRepoActions((prev) => {
        const next = { ...prev };
        delete next[repo.id];
        return next;
      });
    }
  };

  const handleRefreshScheduleChange = async (repo: RepoResponse, value: string) => {
    const interval = Number(value);
    const intervalMinutes = Number.isFinite(interval) && interval > 0 ? interval : null;
    setRepoActions((prev) => ({ ...prev, [repo.id]: 'schedule' }));
    try {
      const updated = await apiClient.setRepoRefreshSchedule(repo.id, intervalMinutes);
      setRepos((prev) => prev.map((item) => (item.id === repo.id ? updated : item)));
    } catch (err) {
      console.error('Failed to update refresh schedule:', err);
    } finally {
      setRepoActions((prev) => {
        const next = { ...prev };
        delete next[repo.id];
        return next;
      });
    }
  };

  const handleDeleteRepo = async (repo: RepoResponse) => {
    if (!confirm(`Delete "${repo.name}" and its CodeSniff artifacts?`)) {
      return;
    }

    setRepoActions((prev) => ({ ...prev, [repo.id]: 'delete' }));
    try {
      await apiClient.deleteRepo(repo.id);
      setRepos((prev) => prev.filter((item) => item.id !== repo.id));
      setSemanticJobs((prev) => {
        const next = { ...prev };
        delete next[repo.id];
        return next;
      });
      setDeepJobs((prev) => {
        const next = { ...prev };
        delete next[repo.id];
        return next;
      });
      clearRepoWorkbenchCache(repo.id);
      if (selectedRepoId === repo.id) {
        setSelectedRepoId(null);
        setHasSearched(false);
        setSearchQuery('');
        clear();
      }
      await loadRepos();
      refetchStats();
    } catch (err) {
      console.error('Failed to delete repo:', err);
    } finally {
      setRepoActions((prev) => {
        const next = { ...prev };
        delete next[repo.id];
        return next;
      });
    }
  };

  const availableLanguages = [
    { value: 'python', label: 'Python' },
    { value: 'javascript', label: 'JavaScript' },
    { value: 'typescript', label: 'TypeScript' },
    { value: 'java', label: 'Java' },
    { value: 'kotlin', label: 'Kotlin' },
    { value: 'html', label: 'HTML' },
    { value: 'css', label: 'CSS' },
    { value: 'vue', label: 'Vue' },
    { value: 'svelte', label: 'Svelte' },
    { value: 'c', label: 'C' },
    { value: 'cpp', label: 'C++' },
    { value: 'csharp', label: 'C#' },
    { value: 'go', label: 'Go' },
    { value: 'rust', label: 'Rust' },
    { value: 'ruby', label: 'Ruby' },
    { value: 'php', label: 'PHP' },
    { value: 'swift', label: 'Swift' },
    { value: 'dart', label: 'Dart' },
    { value: 'scala', label: 'Scala' },
    { value: 'r', label: 'R' },
    { value: 'lua', label: 'Lua' },
    { value: 'perl', label: 'Perl' },
    { value: 'elixir', label: 'Elixir' },
    { value: 'erlang', label: 'Erlang' },
    { value: 'objective-c', label: 'Objective-C' },
    { value: 'objective-c++', label: 'Objective-C++' },
    { value: 'matlab', label: 'MATLAB' },
    { value: 'groovy', label: 'Groovy' },
    { value: 'gradle', label: 'Gradle' },
    { value: 'julia', label: 'Julia' },
    { value: 'fsharp', label: 'F#' },
    { value: 'clojure', label: 'Clojure' },
    { value: 'zig', label: 'Zig' },
    { value: 'shell', label: 'Shell' },
    { value: 'powershell', label: 'PowerShell' },
    { value: 'sql', label: 'SQL' },
    { value: 'markdown', label: 'Markdown' },
    { value: 'yaml', label: 'YAML' },
    { value: 'json', label: 'JSON' },
    { value: 'toml', label: 'TOML' },
    { value: 'xml', label: 'XML' },
    { value: 'ini', label: 'INI' },
    { value: 'terraform', label: 'Terraform' },
    { value: 'hcl', label: 'HCL' },
    { value: 'graphql', label: 'GraphQL' },
    { value: 'protobuf', label: 'Protocol Buffers' },
    { value: 'prisma', label: 'Prisma' },
    { value: 'dockerfile', label: 'Dockerfile' },
    { value: 'makefile', label: 'Makefile' },
    { value: 'just', label: 'Just' },
    { value: 'config', label: 'Config' },
    { value: 'glsl', label: 'GLSL' },
    { value: 'hlsl', label: 'HLSL' },
    { value: 'wgsl', label: 'WGSL' },
    { value: 'metal', label: 'Metal' },
    { value: 'shaderlab', label: 'ShaderLab' },
  ];

  const toggleLanguage = (lang: string) => {
    setSelectedLanguages((prev) => (prev.includes(lang) ? prev.filter((l) => l !== lang) : [...prev, lang]));
  };

  useEffect(() => {
    if (hasSearched && searchQuery.trim()) {
      handleSearch(searchQuery);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedLanguages, selectedRepoId]);

  useEffect(() => {
    loadRepos();
    const interval = setInterval(loadRepos, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    setSelectedModulePath(null);
  }, [selectedRepoId]);

  useEffect(() => {
    if (!selectedRepo || !selectedRepo.lexical_ready || selectedOverview || loadingOverviewRepoId === selectedRepo.id) {
      return;
    }

    void loadRepoOverview(selectedRepo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRepoId, repos, selectedOverview, loadingOverviewRepoId]);

  useEffect(() => {
    if (!selectedRepo || !selectedRepo.lexical_ready || !selectedFactsKey || repoFacts[selectedFactsKey] || loadingFactsKey === selectedFactsKey) {
      return;
    }

    void loadRepoFacts(selectedRepo, selectedFactKind);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRepoId, selectedFactKind, repos, selectedFactsKey, repoFacts, loadingFactsKey]);

  useEffect(() => {
    if (
      !selectedRepo ||
      !selectedRepo.lexical_ready ||
      !selectedRelationshipsKey ||
      repoRelationships[selectedRelationshipsKey] ||
      loadingRelationshipsKey === selectedRelationshipsKey
    ) {
      return;
    }

    void loadRepoRelationships(selectedRepo, selectedRelationshipType);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRepoId, selectedRelationshipType, repos, selectedRelationshipsKey, repoRelationships, loadingRelationshipsKey]);

  useEffect(() => {
    if (!selectedRepo || !selectedRepo.lexical_ready || selectedRepoTeaching || loadingTeachingRepoId === selectedRepo.id) {
      return;
    }

    void loadRepoTeaching(selectedRepo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRepoId, repos, selectedRepoTeaching, loadingTeachingRepoId]);

  useEffect(() => {
    if (
      !selectedRepo ||
      !selectedRepo.lexical_ready ||
      !selectedModulePath ||
      !selectedModuleKey ||
      repoModuleDetails[selectedModuleKey] ||
      loadingModuleDetailKey === selectedModuleKey
    ) {
      return;
    }

    void loadRepoModuleDetail(selectedRepo, selectedModulePath);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedRepoId, selectedModulePath, repos, selectedModuleKey, repoModuleDetails, loadingModuleDetailKey]);

  useEffect(() => {
    const activeJobs = Object.values(semanticJobs).filter((job) => job.status === 'queued' || job.status === 'running');
    if (activeJobs.length === 0) {
      return;
    }

    const interval = setInterval(async () => {
      const updates = await Promise.all(
        activeJobs.map(async (job) => {
          try {
            return await apiClient.getJob(job.id);
          } catch (err) {
            console.error('Failed to poll semantic job:', err);
            return job;
          }
        })
      );

      setSemanticJobs((prev) => {
        const next = { ...prev };
        updates.forEach((job) => {
          if (job.status === 'queued' || job.status === 'running') {
            next[job.repo_id] = job;
          } else {
            delete next[job.repo_id];
          }
        });
        return next;
      });
      void loadRepos();
    }, 2000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [semanticJobs]);

  useEffect(() => {
    const activeJobs = Object.values(deepJobs).filter((job) => job.status === 'queued' || job.status === 'running');
    if (activeJobs.length === 0) {
      return;
    }

    const interval = setInterval(async () => {
      const updates = await Promise.all(
        activeJobs.map(async (job) => {
          try {
            return await apiClient.getJob(job.id);
          } catch (err) {
            console.error('Failed to poll deep enrichment job:', err);
            return job;
          }
        })
      );
      const completedRepoIds = updates
        .filter((job) => job.status === 'complete')
        .map((job) => job.repo_id);

      setDeepJobs((prev) => {
        const next = { ...prev };
        updates.forEach((job) => {
          if (job.status === 'queued' || job.status === 'running') {
            next[job.repo_id] = job;
          } else {
            delete next[job.repo_id];
          }
        });
        return next;
      });
      completedRepoIds.forEach((repoId) => clearRepoWorkbenchCache(repoId));
      void loadRepos();
    }, 2000);

    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepJobs]);

  useEffect(() => {
    if (!isFilesModalOpen) {
      return;
    }

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        handleCloseFilesModal();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isFilesModalOpen]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (languageDropdownRef.current && !languageDropdownRef.current.contains(event.target as Node)) {
        setIsLanguageDropdownOpen(false);
      }
    };
    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setIsLanguageDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
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

      <div className="relative z-10 flex min-h-screen flex-col" aria-hidden={blockingOverlayOpen ? true : undefined}>
        <header className="sticky top-0 z-30 border-b border-white/5 bg-[#05070f]/80 backdrop-blur-2xl">
          <div className="mx-auto flex max-w-6xl items-center justify-between gap-3 px-4 py-4 sm:px-6">
            <div className="flex min-w-0 items-center gap-4 sm:gap-6">
              <button
                onClick={() => window.location.reload()}
                className="flex items-center gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-white text-base font-bold text-gray-900">
                  CS
                </div>
                <div className="hidden min-w-0 sm:block">
                  <p className="text-base font-semibold text-white">CodeSniff</p>
                  <p className="text-[0.65rem] uppercase tracking-[0.35em] text-slate-400">Semantic Search</p>
                </div>
              </button>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                data-ui="browse-files"
                onClick={handleViewFiles}
                disabled={isLoadingFiles}
                title={selectedRepo?.lexical_ready ? 'Browse selected repo files' : 'View indexed files'}
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
                data-ui="upload-index"
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
          <section className="hero-stage relative px-4 pb-12 pt-12 sm:px-6 lg:pt-20">
            <SemanticExcavation className="hero-stage__visual" stats={stats} />
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
                    debounceMs={800}
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
                        className={`chip-suggestion px-5 py-3 ${searchQuery === example.query ? 'is-active' : ''}`}
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
                      <span>STATUS: {stats.semantic_ready ? 'SEMANTIC' : stats.lexical_ready ? 'LEXICAL' : 'EMPTY'}</span>
                    </div>
                  </div>
                )}

                {repos.length > 0 && (
                  <div className="mt-5 grid min-w-0 grid-cols-[minmax(0,1fr)] gap-2">
                    {repos.slice(0, 3).map((repo) => {
                      const semanticJob = semanticJobs[repo.id];
                      const deepJob = deepJobs[repo.id];
                      const semanticBusy = repo.status === 'semantic_warming' || semanticJob?.status === 'queued' || semanticJob?.status === 'running';
                      const deepBusy = repo.status === 'deep_enrich_queued' || repo.status === 'deep_enriching' || deepJob?.status === 'queued' || deepJob?.status === 'running';
                      const canCancelSemantic = semanticJob?.status === 'queued' || semanticJob?.status === 'running';
                      const canCancelDeep = deepJob?.status === 'queued' || deepJob?.status === 'running';
                      const semanticCancelRequested = Boolean(semanticJob?.cancel_requested);
                      const deepCancelRequested = Boolean(deepJob?.cancel_requested);
                      const artifactDegraded = repo.artifact_health === 'degraded';
                      const artifactWarning = repo.artifact_warnings?.[0];
                      const repoRefreshing = repo.status === 'refresh_queued' || repo.status === 'refreshing' || repo.status === 'cloning' || repo.status === 'cleaning' || repo.status === 'fast_indexing';
                      const semanticDegraded = repo.lexical_ready && (repo.status === 'semantic_failed' || (repo.status === 'semantic_ready' && !repo.semantic_ready));
                      const canEnrichRepo = repo.lexical_ready && repo.lexical_index_mode === 'shallow' && !deepBusy && !repoRefreshing && !semanticBusy && !artifactDegraded;
                      const canWarmSemantic = repo.lexical_ready && !repo.semantic_ready && !semanticDegraded && !repoRefreshing && !deepBusy;
                      const canRefreshRepo = repo.lexical_ready && !repoRefreshing && !semanticBusy && !deepBusy && !artifactDegraded;
                      const repoAction = repoActions[repo.id];
                      const deletingRepo = repoAction === 'delete';
                      const repairingRepo = repoAction === 'repair';
                      const refreshingRepo = repoAction === 'refresh' || repoRefreshing;
                      const schedulingRepo = repoAction === 'schedule';
                      const enrichingRepo = repoAction === 'enrich' || deepBusy;
                      const scheduleValue = repo.refresh_interval_minutes || 0;
                      const scheduleOptions = REFRESH_SCHEDULE_OPTIONS.some((option) => option.value === scheduleValue)
                        ? REFRESH_SCHEDULE_OPTIONS
                        : [
                            ...REFRESH_SCHEDULE_OPTIONS,
                            { value: scheduleValue, label: formatScheduleInterval(scheduleValue) },
                          ];
                      const statusLabel = repoRefreshing
                          ? repo.status === 'refresh_queued'
                            ? 'refresh queued'
                            : 'refreshing'
                        : deepCancelRequested
                          ? 'deep cancel requested'
                        : deepBusy
                          ? deepJob?.phase || (repo.status === 'deep_enrich_queued' ? 'deep queued' : 'deep enriching')
                        : repo.semantic_ready
                          ? 'semantic'
                        : semanticCancelRequested
                          ? 'cancel requested'
                        : semanticBusy
                          ? semanticJob?.phase || 'semantic warming'
                          : semanticDegraded
                            ? 'semantic repair'
                            : repo.lexical_ready
                              ? 'lexical'
                                : artifactDegraded
                                  ? 'artifact check'
                                  : repo.status;
                      const repoExpanded = selectedRepoId === repo.id;
                      const repoOverviewId = `repo-overview-${repo.id}`;

                      return (
                        <div
                          key={repo.id}
                          onClick={(event) => {
                            const target = event.target;
                            if (target instanceof HTMLElement && target.closest('button, a, input, select, textarea')) return;
                            toggleRepoDetails(repo.id);
                          }}
                          className={`flex w-full min-w-0 flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm text-slate-300 transition-colors ${
                            repoExpanded
                              ? 'border-blue-300/60 bg-blue-500/15'
                              : 'border-white/10 bg-black/20 hover:border-white/25'
                          }`}
                        >
                          <button
                            data-ui="repo-select"
                            type="button"
                            onClick={() => toggleRepoDetails(repo.id)}
                            disabled={deletingRepo}
                            aria-expanded={repoExpanded}
                            aria-controls={repoOverviewId}
                            title={repoExpanded ? 'Hide repo details' : 'Show repo details'}
                            className="flex min-h-11 w-full min-w-0 items-center justify-between gap-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 disabled:cursor-wait disabled:opacity-60 sm:w-auto sm:flex-1"
                          >
                            <div className="min-w-0">
                              <p className="truncate font-medium text-white">{repo.name}</p>
                              <p className="text-xs text-slate-500">
                                {repo.total_files.toLocaleString()} files - {repo.total_symbols.toLocaleString()} symbols - {formatBytes(repo.storage_bytes)}
                              </p>
                            </div>
                            <span className="shrink-0 rounded-md border border-white/10 px-2 py-1 text-xs uppercase tracking-[0.2em] text-slate-300">
                              {statusLabel}
                            </span>
                          </button>
                          <div className="flex w-full shrink-0 flex-wrap items-center justify-start gap-2 sm:w-auto sm:justify-end">
                            {semanticDegraded && (
                              <button
                                data-ui="repo-repair"
                                type="button"
                                onClick={() => handleRepairSemantics(repo)}
                                disabled={repairingRepo || deletingRepo}
                                title="Remove broken semantic artifacts"
                                aria-label={`Repair semantic artifacts for ${repo.name}`}
                                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-amber-300/30 text-amber-100 transition-colors hover:border-amber-200/60 hover:bg-amber-400/10 disabled:cursor-wait disabled:opacity-60"
                              >
                                <Wrench className={`h-4 w-4 ${repairingRepo ? 'animate-pulse' : ''}`} />
                              </button>
                            )}
                            {canRefreshRepo && (
                              <button
                                data-ui="repo-refresh"
                                type="button"
                                onClick={() => handleRefreshRepo(repo)}
                                disabled={refreshingRepo || deletingRepo || repairingRepo}
                                title="Refresh lexical index"
                                aria-label={`Refresh ${repo.name}`}
                                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-white/10 text-slate-200 transition-colors hover:border-white/30 hover:bg-white/5 disabled:cursor-wait disabled:opacity-60"
                              >
                                <RotateCw className={`h-4 w-4 ${refreshingRepo ? 'animate-spin' : ''}`} />
                              </button>
                            )}
                            {(canEnrichRepo || deepBusy) && (
                              <button
                                data-ui="repo-enrich"
                                type="button"
                                onClick={() => handleEnrichRepo(repo)}
                                disabled={!canEnrichRepo || deletingRepo || repairingRepo || refreshingRepo || deepBusy}
                                title={deepBusy ? 'Deep lexical enrichment is queued or running' : 'Build full symbols from the stored source'}
                                aria-label={`Deep enrich ${repo.name}`}
                                className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg border border-emerald-300/25 px-3 py-2 text-xs font-medium uppercase tracking-[0.16em] text-emerald-100 transition-colors hover:border-emerald-200/50 hover:bg-emerald-400/10 disabled:cursor-wait disabled:opacity-60"
                              >
                                <FileCode2 className={`h-4 w-4 ${enrichingRepo ? 'animate-pulse' : ''}`} />
                                <span>{deepBusy ? 'Deepening' : 'Deep'}</span>
                              </button>
                            )}
                            {canCancelDeep && (
                              <button
                                data-ui="repo-enrich-cancel"
                                type="button"
                                onClick={() => deepJob && handleCancelDeepJob(deepJob)}
                                disabled={deletingRepo || repairingRepo || refreshingRepo || deepCancelRequested}
                                title={deepCancelRequested ? 'Deep enrichment cancel requested' : 'Cancel deep enrichment'}
                                aria-label={`Cancel deep enrichment for ${repo.name}`}
                                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-white/10 text-slate-200 transition-colors hover:border-white/30 hover:bg-white/5 disabled:cursor-wait disabled:opacity-60"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            )}
                            {repo.lexical_ready && (
                              <label
                                className="inline-flex min-h-11 min-w-0 shrink-0 items-center gap-2 rounded-lg border border-white/10 px-2 text-slate-300 transition-colors focus-within:border-white/30 hover:border-white/25"
                                title={formatScheduleTitle(repo)}
                              >
                                <Clock3 className={`h-4 w-4 shrink-0 ${schedulingRepo ? 'animate-pulse' : ''}`} />
                                <span className="sr-only">Scheduled refresh</span>
                                <select
                                  data-ui="repo-refresh-schedule"
                                  value={String(scheduleValue)}
                                  onChange={(event) => handleRefreshScheduleChange(repo, event.target.value)}
                                  disabled={schedulingRepo || deletingRepo || repairingRepo || refreshingRepo || deepBusy}
                                  aria-label={`Scheduled refresh for ${repo.name}`}
                                  className="min-h-9 max-w-28 bg-slate-950/90 text-xs font-medium uppercase tracking-[0.14em] text-slate-200 outline-none disabled:cursor-wait disabled:opacity-60"
                                >
                                  {scheduleOptions.map((option) => (
                                    <option key={option.value} value={option.value}>
                                      {option.label}
                                    </option>
                                  ))}
                                </select>
                              </label>
                            )}
                            {canWarmSemantic && (
                              <button
                                data-ui="semantic-warm"
                                type="button"
                                onClick={() => handleWarmSemantics(repo)}
                                disabled={semanticBusy || deletingRepo || refreshingRepo || deepBusy}
                                title="Warm semantic vectors"
                                className="inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg border border-blue-300/25 px-3 py-2 text-xs font-medium uppercase tracking-[0.16em] text-blue-100 transition-colors hover:border-blue-200/50 hover:bg-blue-400/10 disabled:cursor-wait disabled:opacity-60"
                              >
                                <Zap className={`h-4 w-4 ${semanticBusy ? 'animate-pulse' : ''}`} />
                                <span>{semanticBusy ? 'Warming' : 'Warm'}</span>
                              </button>
                            )}
                            {canCancelSemantic && (
                              <button
                                data-ui="semantic-cancel"
                                type="button"
                                onClick={() => semanticJob && handleCancelSemanticJob(semanticJob)}
                                disabled={deletingRepo || repairingRepo || refreshingRepo || semanticCancelRequested}
                                title={semanticCancelRequested ? 'Semantic cancel requested' : 'Cancel semantic warmup'}
                                aria-label={`Cancel semantic warmup for ${repo.name}`}
                                className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-white/10 text-slate-200 transition-colors hover:border-white/30 hover:bg-white/5 disabled:cursor-wait disabled:opacity-60"
                              >
                                <X className="h-4 w-4" />
                              </button>
                            )}
                            <button
                              data-ui="repo-delete"
                              type="button"
                              onClick={() => handleDeleteRepo(repo)}
                              disabled={deletingRepo || repairingRepo || refreshingRepo || deepBusy}
                              title="Delete repo artifacts"
                              aria-label={`Delete ${repo.name}`}
                              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-red-300/25 text-red-100 transition-colors hover:border-red-200/60 hover:bg-red-400/10 disabled:cursor-wait disabled:opacity-60"
                            >
                              <Trash2 className={`h-4 w-4 ${deletingRepo ? 'animate-pulse' : ''}`} />
                            </button>
                          </div>
                          {artifactDegraded && artifactWarning && (
                            <p className="w-full min-w-0 break-words text-xs text-amber-100">
                              Artifact check: {artifactWarning}
                            </p>
                          )}
                          {deepBusy && deepJob && (
                            <p className="w-full min-w-0 break-words text-xs text-emerald-100">
                              Deep enrichment: {deepJob.phase} - {deepJob.files_indexed.toLocaleString()} files, {deepJob.symbols_indexed.toLocaleString()} symbols
                            </p>
                          )}
                        </div>
                      );
                    })}
                    {selectedRepoId && (
                      <button
                        type="button"
                        onClick={() => setSelectedRepoId(null)}
                        className="w-fit rounded-lg border border-white/10 px-3 py-2 text-xs uppercase tracking-[0.2em] text-slate-400 transition-colors hover:border-white/25 hover:text-white"
                      >
                        Search all repos
                      </button>
                    )}
                    {selectedRepo && (
                      <div
                        id={`repo-overview-${selectedRepo.id}`}
                        data-ui="repo-overview"
                        role="region"
                        aria-label={`${selectedRepo.name} repository details`}
                        className="w-full min-w-0 rounded-lg border border-white/10 bg-black/20 p-4 text-sm text-slate-300"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <div className="flex min-w-0 items-center gap-3">
                            <FolderTree className="h-4 w-4 shrink-0 text-blue-200" />
                            <div className="min-w-0">
                              <p className="truncate text-sm font-medium text-white">{selectedRepo.name}</p>
                              <p className="text-xs text-slate-500">
                                {selectedRepo.total_files.toLocaleString()} files - {selectedRepo.total_symbols.toLocaleString()} symbols
                              </p>
                            </div>
                          </div>
                          {loadingOverviewRepoId === selectedRepo.id && (
                            <span className="rounded-md border border-white/10 px-2 py-1 text-xs uppercase tracking-[0.16em] text-slate-400">
                              Loading
                            </span>
                          )}
                        </div>

                        {!selectedRepo.lexical_ready && (
                          <p className="mt-4 text-sm text-amber-100">Overview waits for the lexical index. Current status: {selectedRepo.status}.</p>
                        )}

                        {selectedRepo.lexical_ready && overviewErrors[selectedRepo.id] && (
                          <p className="mt-4 text-sm text-red-200">{overviewErrors[selectedRepo.id]}</p>
                        )}

                        {selectedRepo.lexical_ready && selectedOverview && (selectedOverview.index_fallbacks ?? []).length > 0 && (
                          <div data-ui="index-fallback-warning" className="mt-4 rounded-md border border-amber-300/20 bg-amber-400/10 px-3 py-3">
                            <div className="flex min-w-0 items-start gap-2">
                              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-200" />
                              <div className="min-w-0">
                                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-amber-100">
                                  Bounded indexing fallback
                                </p>
                                <p className="mt-1 text-xs text-amber-100/80">
                                  {(selectedOverview.index_fallbacks ?? []).length.toLocaleString()} files were indexed with path-level rows and bounded samples when available instead of full parser output.
                                </p>
                                <ul className="mt-2 space-y-1">
                                  {(selectedOverview.index_fallbacks ?? []).slice(0, 3).map((fallback) => (
                                    <li key={fallback.path} className="min-w-0">
                                      <p className="break-words font-mono text-xs text-amber-50 [overflow-wrap:anywhere]" title={fallback.path}>
                                        {fallback.path}
                                      </p>
                                      <p className="break-words text-[0.68rem] text-amber-100/70 [overflow-wrap:anywhere]" title={fallback.reason}>
                                        {fallback.reason}
                                      </p>
                                    </li>
                                  ))}
                                </ul>
                              </div>
                            </div>
                          </div>
                        )}

                        {selectedRepo.lexical_ready && selectedOverview && (
                          <div className="mt-4 grid gap-5 lg:grid-cols-[1.1fr_0.9fr]">
                            <div className="min-w-0 space-y-4">
                              <div>
                                <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-slate-500">
                                  <FileCode2 className="h-4 w-4 text-blue-200" />
                                  Languages
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  {selectedOverview.languages.slice(0, 6).map((language) => (
                                    <span
                                      key={language.language}
                                      className="inline-flex min-w-0 max-w-full flex-wrap items-center gap-1.5 rounded-md border border-white/10 px-2 py-1 text-xs text-slate-200"
                                    >
                                      <span className="min-w-0 break-words [overflow-wrap:anywhere]">
                                        {language.language}: {language.file_count}
                                      </span>
                                      <span
                                        data-ui="language-support"
                                        className={`shrink-0 rounded border px-1.5 py-0.5 text-[0.62rem] font-semibold uppercase ${languageSupportClass(language.support_level, language.symbol_aware)}`}
                                      >
                                        {formatLanguageSupport(language.support_level, language.symbol_aware)}
                                      </span>
                                    </span>
                                  ))}
                                </div>
                              </div>

                              <div>
                                <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-slate-500">
                                  <FolderTree className="h-4 w-4 text-blue-200" />
                                  Directories
                                </div>
                                <div className="grid gap-2 sm:grid-cols-2">
                                  {selectedOverview.top_directories.slice(0, 4).map((directory) => (
                                    <div key={directory.path} className="min-w-0">
                                      <p className="truncate text-sm text-slate-200" title={directory.path}>{directory.path}</p>
                                      <p className="text-xs text-slate-500">{directory.file_count} files - {directory.line_count.toLocaleString()} lines</p>
                                    </div>
                                  ))}
                                </div>
                              </div>

                              <div data-ui="repo-modules" className="min-w-0">
                                <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-slate-500">
                                  <Package className="h-4 w-4 text-blue-200" />
                                  Modules
                                </div>
                                <div className="grid gap-2 sm:grid-cols-2">
                                  {(selectedOverview.modules ?? []).slice(0, 4).map((moduleItem) => (
                                    <button
                                      key={moduleItem.path}
                                      type="button"
                                      data-ui="module-card"
                                      aria-pressed={selectedModulePath === moduleItem.path}
                                      onClick={() => setSelectedModulePath((current) => (current === moduleItem.path ? null : moduleItem.path))}
                                      className={`min-h-11 min-w-0 rounded-md border px-2 py-2 text-left transition-colors ${
                                        selectedModulePath === moduleItem.path
                                          ? 'border-blue-300/60 bg-blue-400/10'
                                          : 'border-white/10 hover:border-white/25 hover:bg-white/5'
                                      }`}
                                    >
                                      <div className="flex min-w-0 flex-wrap items-center gap-2">
                                        <p className="min-w-0 truncate text-sm text-slate-200" title={moduleItem.path}>
                                          {moduleItem.path}
                                        </p>
                                        <span className="shrink-0 rounded bg-white/10 px-2 py-0.5 text-[0.68rem] font-semibold uppercase text-slate-300">
                                          {moduleItem.symbol_count.toLocaleString()} sym
                                        </span>
                                      </div>
                                      <p className="mt-1 text-xs text-slate-500">
                                        {moduleItem.file_count.toLocaleString()} files - {moduleItem.line_count.toLocaleString()} lines
                                      </p>
                                      {moduleItem.sample_files.length > 0 && (
                                        <p className="mt-1 truncate text-xs text-slate-500" title={moduleItem.sample_files.join(' - ')}>
                                          {moduleItem.sample_files.slice(0, 2).join(' - ')}
                                        </p>
                                      )}
                                    </button>
                                  ))}
                                  {(selectedOverview.modules ?? []).length === 0 && (
                                    <p className="text-xs text-slate-500">No module summary indexed</p>
                                  )}
                                </div>

                                {(selectedOverview.module_dependencies ?? []).length > 0 && (
                                  <div data-ui="module-dependencies" className="mt-3 min-w-0 rounded-md border border-white/10 bg-black/20 px-3 py-3">
                                    <div className="mb-2 flex items-center justify-between gap-2">
                                      <p className="text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-slate-500">Module Graph</p>
                                      <span className="rounded-md border border-white/10 px-2 py-1 text-[0.68rem] uppercase tracking-[0.16em] text-slate-500">
                                        {(selectedOverview.module_dependencies ?? []).length}
                                      </span>
                                    </div>
                                    <ul className="space-y-2">
                                      {(selectedOverview.module_dependencies ?? []).slice(0, 4).map((dependency) => (
                                        <li
                                          key={`${dependency.source_module}->${dependency.target_module}`}
                                          className="min-w-0 rounded-md border border-white/10 px-2 py-2"
                                        >
                                          <p className="break-words font-mono text-xs text-slate-100 [overflow-wrap:anywhere]">
                                            {dependency.source_module}{' -> '}{dependency.target_module}
                                          </p>
                                          <p className="mt-1 break-words text-[0.68rem] text-slate-500 [overflow-wrap:anywhere]">
                                            {dependency.import_count.toLocaleString()} imports - {dependency.source_path}{dependency.source_line ? `:${dependency.source_line}` : ''}
                                          </p>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}

                                {selectedModulePath && (
                                  <div data-ui="module-detail" className="mt-3 min-w-0 rounded-md border border-white/10 bg-black/20 px-3 py-3">
                                    <div className="flex flex-wrap items-center justify-between gap-2">
                                      <div className="min-w-0">
                                        <p className="break-words font-mono text-sm text-white [overflow-wrap:anywhere]">{selectedModulePath}</p>
                                        {selectedModuleDetail && (
                                          <p className="mt-1 text-xs text-slate-500">
                                            {selectedModuleDetail.file_count.toLocaleString()} files - {selectedModuleDetail.symbol_count.toLocaleString()} symbols - {selectedModuleDetail.line_count.toLocaleString()} lines
                                          </p>
                                        )}
                                      </div>
                                      {loadingModuleDetailKey === selectedModuleKey && (
                                        <span className="rounded-md border border-white/10 px-2 py-1 text-xs uppercase tracking-[0.16em] text-slate-400">
                                          Loading
                                        </span>
                                      )}
                                    </div>

                                    {selectedModuleError && loadingModuleDetailKey !== selectedModuleKey && (
                                      <p className="mt-3 rounded-md border border-red-300/20 bg-red-500/10 px-3 py-2 text-xs text-red-100">{selectedModuleError}</p>
                                    )}

                                    {selectedModuleDetail && loadingModuleDetailKey !== selectedModuleKey && (
                                      <div className="mt-3 grid gap-3">
                                        <div className="grid gap-3 sm:grid-cols-2">
                                          <div className="min-w-0">
                                            <p className="mb-2 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-slate-500">Files</p>
                                            <ul className="space-y-2">
                                              {selectedModuleDetail.files.slice(0, 4).map((file) => (
                                                <li key={file.id} className="min-w-0">
                                                  <p className="break-words font-mono text-xs text-slate-200 [overflow-wrap:anywhere]" title={file.path}>{file.path}</p>
                                                  <p className="text-[0.68rem] text-slate-500">{file.language} - {file.symbol_count} symbols</p>
                                                </li>
                                              ))}
                                            </ul>
                                          </div>

                                          <div className="min-w-0">
                                            <p className="mb-2 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-slate-500">Symbols</p>
                                            <div className="flex flex-wrap gap-2">
                                              {selectedModuleDetail.symbols.slice(0, 8).map((symbol) => (
                                                <span
                                                  key={symbol.id}
                                                  className="max-w-full break-words rounded-md border border-white/10 px-2 py-1 font-mono text-xs text-slate-200 [overflow-wrap:anywhere]"
                                                  title={`${symbol.file_path}:${symbol.start_line}`}
                                                >
                                                  {symbol.name}
                                                </span>
                                              ))}
                                              {selectedModuleDetail.symbols.length === 0 && (
                                                <span className="text-xs text-slate-500">No symbols indexed</span>
                                              )}
                                            </div>
                                          </div>
                                        </div>

                                        <div className="grid gap-3 sm:grid-cols-2">
                                          <div className="min-w-0">
                                            <p className="mb-2 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-slate-500">Imports</p>
                                            <ul className="space-y-2">
                                              {selectedModuleDetail.imports.slice(0, 4).map((relationship) => (
                                                <li key={relationship.id} className="min-w-0 rounded-md border border-white/10 px-2 py-2">
                                                  <p className="break-words font-mono text-xs text-slate-100 [overflow-wrap:anywhere]">{relationship.target}</p>
                                                  <p className="mt-1 break-words text-[0.68rem] text-slate-500 [overflow-wrap:anywhere]">
                                                    {relationship.source_path || '(repo)'}{relationship.source_line ? `:${relationship.source_line}` : ''}
                                                  </p>
                                                </li>
                                              ))}
                                              {selectedModuleDetail.imports.length === 0 && (
                                                <li className="text-xs text-slate-500">No imports indexed</li>
                                              )}
                                            </ul>
                                          </div>

                                          <div className="min-w-0">
                                            <p className="mb-2 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-slate-500">Exports</p>
                                            <ul className="space-y-2">
                                              {selectedModuleDetail.exports.slice(0, 4).map((relationship) => (
                                                <li key={relationship.id} className="min-w-0 rounded-md border border-white/10 px-2 py-2">
                                                  <p className="break-words font-mono text-xs text-slate-100 [overflow-wrap:anywhere]">{relationship.target}</p>
                                                  <p className="mt-1 break-words text-[0.68rem] text-slate-500 [overflow-wrap:anywhere]">
                                                    {relationship.source_path || '(repo)'}{relationship.source_line ? `:${relationship.source_line}` : ''}
                                                  </p>
                                                </li>
                                              ))}
                                              {selectedModuleDetail.exports.length === 0 && (
                                                <li className="text-xs text-slate-500">No exports indexed</li>
                                              )}
                                            </ul>
                                          </div>
                                        </div>

                                        <div className="grid gap-3 sm:grid-cols-2">
                                          <div className="min-w-0">
                                            <p className="mb-2 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-slate-500">Outgoing</p>
                                            <ul className="space-y-2">
                                              {selectedModuleDetail.outgoing.slice(0, 4).map((relationship) => {
                                                const metadataDetail = formatRelationshipMeta(relationship.metadata);
                                                return (
                                                  <li key={relationship.id} className="min-w-0 rounded-md border border-white/10 px-2 py-2">
                                                    <div className="flex flex-wrap gap-2">
                                                      <span className="rounded bg-white/10 px-2 py-0.5 text-[0.68rem] font-semibold uppercase text-slate-200">{formatRelationshipType(relationship.rel_type)}</span>
                                                      <span className="rounded bg-blue-400/15 px-2 py-0.5 text-[0.68rem] font-semibold uppercase text-blue-100">{relationship.confidence}</span>
                                                    </div>
                                                    <p className="mt-2 break-words font-mono text-xs text-slate-100 [overflow-wrap:anywhere]">{relationship.target}</p>
                                                    <p className="mt-1 break-words text-[0.68rem] text-slate-500 [overflow-wrap:anywhere]">
                                                      {relationship.source_path || '(repo)'}{relationship.source_symbol ? ` :: ${relationship.source_symbol}` : ''}
                                                    </p>
                                                    {metadataDetail && (
                                                      <p className="mt-1 break-words text-[0.68rem] text-slate-400 [overflow-wrap:anywhere]">{metadataDetail}</p>
                                                    )}
                                                  </li>
                                                );
                                              })}
                                              {selectedModuleDetail.outgoing.length === 0 && (
                                                <li className="text-xs text-slate-500">No outgoing relationships indexed</li>
                                              )}
                                            </ul>
                                          </div>

                                          <div className="min-w-0">
                                            <p className="mb-2 text-[0.68rem] font-semibold uppercase tracking-[0.16em] text-slate-500">Incoming</p>
                                            <ul className="space-y-2">
                                              {selectedModuleDetail.incoming.slice(0, 4).map((relationship) => {
                                                const metadataDetail = formatRelationshipMeta(relationship.metadata);
                                                return (
                                                  <li key={relationship.id} className="min-w-0 rounded-md border border-white/10 px-2 py-2">
                                                    <div className="flex flex-wrap gap-2">
                                                      <span className="rounded bg-white/10 px-2 py-0.5 text-[0.68rem] font-semibold uppercase text-slate-200">{formatRelationshipType(relationship.rel_type)}</span>
                                                      <span className="rounded bg-blue-400/15 px-2 py-0.5 text-[0.68rem] font-semibold uppercase text-blue-100">{relationship.confidence}</span>
                                                    </div>
                                                    <p className="mt-2 break-words font-mono text-xs text-slate-100 [overflow-wrap:anywhere]">{relationship.target}</p>
                                                    <p className="mt-1 break-words text-[0.68rem] text-slate-500 [overflow-wrap:anywhere]">
                                                      {relationship.source_path || '(repo)'}{relationship.source_symbol ? ` :: ${relationship.source_symbol}` : ''}
                                                    </p>
                                                    {metadataDetail && (
                                                      <p className="mt-1 break-words text-[0.68rem] text-slate-400 [overflow-wrap:anywhere]">{metadataDetail}</p>
                                                    )}
                                                  </li>
                                                );
                                              })}
                                              {selectedModuleDetail.incoming.length === 0 && (
                                                <li className="text-xs text-slate-500">No incoming relationships indexed</li>
                                              )}
                                            </ul>
                                          </div>
                                        </div>
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>

                              <div className="grid gap-4 sm:grid-cols-2">
                                <div className="min-w-0">
                                  <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-slate-500">
                                    <Play className="h-4 w-4 text-blue-200" />
                                    Entry
                                  </div>
                                  <ul className="space-y-2">
                                    {(selectedOverview.entry_points.length ? selectedOverview.entry_points : []).slice(0, 4).map((item) => (
                                      <li key={item.path} className="min-w-0">
                                        <p className="truncate text-sm text-slate-200" title={item.path}>{item.path}</p>
                                        <p className="text-xs text-slate-500">{item.detail}</p>
                                      </li>
                                    ))}
                                    {selectedOverview.entry_points.length === 0 && (
                                      <li className="text-xs text-slate-500">No entry files indexed</li>
                                    )}
                                  </ul>
                                </div>

                                <div className="min-w-0">
                                  <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-slate-500">
                                    <ClipboardList className="h-4 w-4 text-blue-200" />
                                    Scripts
                                  </div>
                                  <ul className="space-y-2">
                                    {selectedOverview.package_scripts.slice(0, 4).map((script) => (
                                      <li key={`${script.source_path}:${script.name}`} className="min-w-0">
                                        <p className="truncate text-sm text-slate-200" title={script.name}>{script.name}</p>
                                        <p className="truncate text-xs text-slate-500" title={script.command}>{script.command}</p>
                                      </li>
                                    ))}
                                    {selectedOverview.package_scripts.length === 0 && (
                                      <li className="text-xs text-slate-500">No package scripts indexed</li>
                                    )}
                                  </ul>
                                </div>
                              </div>

                              <div>
                                <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-slate-500">
                                  <Terminal className="h-4 w-4 text-blue-200" />
                                  Runbook
                                </div>
                                <ul className="space-y-2">
                                  {(selectedOverview.runbook_commands ?? []).slice(0, 6).map((command) => (
                                    <li key={`${command.source_path}:${command.command}`} className="min-w-0 rounded-md border border-white/10 px-2 py-2">
                                      <div className="flex min-w-0 items-center gap-2">
                                        <span className="shrink-0 rounded bg-white/10 px-2 py-0.5 text-[0.68rem] font-semibold uppercase text-slate-200">
                                          {command.category}
                                        </span>
                                        <p className="min-w-0 truncate font-mono text-sm text-slate-100" title={command.command}>{command.command}</p>
                                      </div>
                                      <p className="mt-1 truncate text-xs text-slate-500" title={`${command.source_path}${command.detail ? ` - ${command.detail}` : ''}`}>
                                        {command.source_path}{command.detail ? ` - ${command.detail}` : ''}
                                      </p>
                                    </li>
                                  ))}
                                  {(selectedOverview.runbook_commands ?? []).length === 0 && (
                                    <li className="text-xs text-slate-500">No commands indexed</li>
                                  )}
                                </ul>
                              </div>

                              <div>
                                <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-slate-500">
                                  <FileCode2 className="h-4 w-4 text-blue-200" />
                                  API Routes
                                </div>
                                <ul className="space-y-2">
                                  {selectedOverview.route_endpoints.slice(0, 6).map((route) => (
                                    <li key={`${route.method}:${route.path}:${route.source_path}:${route.line}`} className="min-w-0 rounded-md border border-white/10 px-2 py-2">
                                      <div className="flex min-w-0 items-center gap-2">
                                        <span className="shrink-0 rounded bg-blue-400/15 px-2 py-0.5 text-[0.68rem] font-semibold text-blue-100">
                                          {route.method}
                                        </span>
                                        <p className="min-w-0 truncate text-sm text-slate-100" title={route.path}>{route.path}</p>
                                      </div>
                                      <p className="mt-1 truncate text-xs text-slate-500" title={`${route.source_path}:${route.line}`}>
                                        {route.framework} - {route.source_path}:{route.line}
                                      </p>
                                    </li>
                                  ))}
                                  {selectedOverview.route_endpoints.length === 0 && (
                                    <li className="text-xs text-slate-500">No routes indexed</li>
                                  )}
                                </ul>
                              </div>

                              <div>
                                <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-slate-500">
                                  <GitBranch className="h-4 w-4 text-blue-200" />
                                  Imports
                                </div>
                                <ul className="space-y-2">
                                  {(selectedOverview.import_relationships ?? []).slice(0, 6).map((item) => (
                                    <li key={`${item.source_path}:${item.source_line}:${item.target}`} className="min-w-0 rounded-md border border-white/10 px-2 py-2">
                                      <div className="flex min-w-0 items-center gap-2">
                                        <span className="shrink-0 rounded bg-white/10 px-2 py-0.5 text-[0.68rem] font-semibold uppercase text-slate-200">
                                          {item.confidence}
                                        </span>
                                        <p className="min-w-0 truncate font-mono text-sm text-slate-100" title={item.target}>
                                          {item.target}
                                        </p>
                                      </div>
                                      <p className="mt-1 truncate text-xs text-slate-500" title={`${item.source_path}:${item.source_line}`}>
                                        {item.source_path}:{item.source_line}
                                      </p>
                                      {item.target_path && (
                                        <p className="mt-1 min-w-0 break-words text-[0.68rem] text-slate-400 [overflow-wrap:anywhere]" title={item.target_path}>
                                          target: {item.target_path}
                                        </p>
                                      )}
                                    </li>
                                  ))}
                                  {(selectedOverview.import_relationships ?? []).length === 0 && (
                                    <li className="text-xs text-slate-500">No imports indexed</li>
                                  )}
                                </ul>
                              </div>
                            </div>

                            <div className="min-w-0 space-y-4">
                              <div data-ui="repo-teaching" className="min-w-0">
                                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                                  <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-slate-500">
                                    <ClipboardList className="h-4 w-4 text-blue-200" />
                                    Guide
                                  </div>
                                  {selectedRepoTeaching && (
                                    <span className="rounded-md border border-white/10 px-2 py-1 text-[0.68rem] uppercase tracking-[0.16em] text-slate-500">
                                      {selectedRepoTeaching.steps.length}
                                    </span>
                                  )}
                                </div>

                                {loadingTeachingRepoId === selectedRepo.id && (
                                  <p className="rounded-md border border-white/10 px-3 py-2 text-xs text-slate-500">Loading guide</p>
                                )}

                                {selectedTeachingError && loadingTeachingRepoId !== selectedRepo.id && (
                                  <p className="rounded-md border border-red-300/20 bg-red-500/10 px-3 py-2 text-xs text-red-100">{selectedTeachingError}</p>
                                )}

                                {selectedRepoTeaching && loadingTeachingRepoId !== selectedRepo.id && selectedRepoTeaching.steps.length === 0 && (
                                  <p className="rounded-md border border-white/10 px-3 py-2 text-xs text-slate-500">No cited guide indexed</p>
                                )}

                                <form
                                  data-ui="teaching-query-form"
                                  onSubmit={handleAskRepoTeaching}
                                  className="mb-2 flex min-w-0 flex-wrap items-center gap-2"
                                >
                                  <input
                                    data-ui="teaching-query-input"
                                    type="text"
                                    value={teachingQuestion}
                                    onChange={(event) => setTeachingQuestion(event.target.value)}
                                    placeholder="Ask about routes, tests, setup"
                                    className="min-h-10 min-w-0 flex-1 rounded-lg border border-white/10 bg-black/20 px-3 text-sm text-slate-100 outline-none transition-colors placeholder:text-slate-600 focus:border-blue-300/60"
                                  />
                                  <button
                                    data-ui="teaching-query-run"
                                    type="submit"
                                    disabled={!selectedRepo.lexical_ready || teachingQuestion.trim().length < 2 || loadingTeachingQueryRepoId === selectedRepo.id}
                                    className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg border border-white/10 px-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-300 transition-colors hover:border-white/25 hover:text-white disabled:cursor-wait disabled:opacity-60"
                                  >
                                    <Play className={`h-3.5 w-3.5 ${loadingTeachingQueryRepoId === selectedRepo.id ? 'animate-pulse' : ''}`} />
                                    <span>{loadingTeachingQueryRepoId === selectedRepo.id ? 'Finding' : 'Ask'}</span>
                                  </button>
                                </form>

                                {selectedTeachingQueryError && loadingTeachingQueryRepoId !== selectedRepo.id && (
                                  <p className="mb-2 rounded-md border border-red-300/20 bg-red-500/10 px-3 py-2 text-xs text-red-100">{selectedTeachingQueryError}</p>
                                )}

                                {selectedRepoTeachingQuery && (
                                  <div data-ui="teaching-query-result" className="mb-2 space-y-2">
                                    <p className="min-w-0 break-words rounded-md border border-blue-300/20 bg-blue-400/10 px-3 py-2 text-xs text-blue-100 [overflow-wrap:anywhere]">
                                      {selectedRepoTeachingQuery.answer}
                                    </p>
                                    <ul className="space-y-2">
                                      {selectedRepoTeachingQuery.evidence.slice(0, 4).map((item, index) => (
                                        <li key={`${item.kind}:${item.title}:${index}`} className="min-w-0 rounded-md border border-white/10 px-2 py-2">
                                          <div className="flex min-w-0 flex-wrap items-center gap-2">
                                            <span className="shrink-0 rounded bg-emerald-400/15 px-2 py-0.5 text-[0.68rem] font-semibold uppercase text-emerald-100">
                                              {item.kind.replace(/_/g, ' ')}
                                            </span>
                                            <span className="min-w-0 break-words text-xs font-medium text-slate-100 [overflow-wrap:anywhere]">
                                              {item.title}
                                            </span>
                                          </div>
                                          <p className="mt-1 min-w-0 break-words text-xs text-slate-400 [overflow-wrap:anywhere]">
                                            {item.summary}
                                          </p>
                                          <div className="mt-2 flex flex-wrap gap-2">
                                            {item.citations.slice(0, 3).map((citation) => (
                                              <span
                                                key={`${item.kind}:${item.title}:${citation.source_path}:${citation.source_line || 0}:${citation.label}`}
                                                className="max-w-full break-words rounded-md border border-white/10 px-2 py-1 font-mono text-[0.68rem] text-slate-500 [overflow-wrap:anywhere]"
                                                title={`${citation.label} - ${citation.source_path}${citation.source_line ? `:${citation.source_line}` : ''}`}
                                              >
                                                {citation.source_path}{citation.source_line ? `:${citation.source_line}` : ''}
                                              </span>
                                            ))}
                                          </div>
                                        </li>
                                      ))}
                                    </ul>
                                  </div>
                                )}

                                {selectedRepoTeaching && selectedRepoTeaching.steps.length > 0 && (
                                  <ul className="space-y-2">
                                    {selectedRepoTeaching.steps.slice(0, 6).map((step) => (
                                      <li key={step.id} className="min-w-0 rounded-md border border-white/10 px-2 py-2">
                                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                                          <span className="shrink-0 rounded bg-blue-400/15 px-2 py-0.5 text-[0.68rem] font-semibold uppercase text-blue-100">
                                            {step.title}
                                          </span>
                                          <span className="min-w-0 break-words text-xs text-slate-300 [overflow-wrap:anywhere]">
                                            {step.summary}
                                          </span>
                                        </div>
                                        <div className="mt-2 flex flex-wrap gap-2">
                                          {step.citations.slice(0, 4).map((citation) => (
                                            <span
                                              key={`${step.id}:${citation.kind}:${citation.source_path}:${citation.source_line || 0}:${citation.label}`}
                                              className="max-w-full break-words rounded-md border border-white/10 px-2 py-1 font-mono text-[0.68rem] text-slate-400 [overflow-wrap:anywhere]"
                                              title={`${citation.label} - ${citation.source_path}${citation.source_line ? `:${citation.source_line}` : ''}`}
                                            >
                                              {citation.source_path}{citation.source_line ? `:${citation.source_line}` : ''}
                                            </span>
                                          ))}
                                        </div>
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>

                              <div data-ui="search-quality" className="min-w-0">
                                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                                  <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-slate-500">
                                    <Gauge className="h-4 w-4 text-blue-200" />
                                    Quality
                                  </div>
                                  <button
                                    data-ui="search-quality-run"
                                    type="button"
                                    onClick={() => handleRunSearchQuality(selectedRepo)}
                                    disabled={loadingSearchQualityRepoId === selectedRepo.id}
                                    className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-white/10 px-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-300 transition-colors hover:border-white/25 hover:text-white disabled:cursor-wait disabled:opacity-60"
                                  >
                                    <Play className={`h-3.5 w-3.5 ${loadingSearchQualityRepoId === selectedRepo.id ? 'animate-pulse' : ''}`} />
                                    <span>{loadingSearchQualityRepoId === selectedRepo.id ? 'Running' : 'Run'}</span>
                                  </button>
                                </div>

                                {selectedSearchQualityError && loadingSearchQualityRepoId !== selectedRepo.id && (
                                  <p className="rounded-md border border-red-300/20 bg-red-500/10 px-3 py-2 text-xs text-red-100">{selectedSearchQualityError}</p>
                                )}

                                {!selectedRepoSearchQuality && loadingSearchQualityRepoId !== selectedRepo.id && !selectedSearchQualityError && (
                                  <p className="rounded-md border border-white/10 px-3 py-2 text-xs text-slate-500">Run curated repo cases or generated smoke queries from indexed facts</p>
                                )}

                                {selectedRepoSearchQuality && (
                                  <div className="space-y-2">
                                    <div className="grid grid-cols-3 gap-2">
                                      <div className="min-w-0 rounded-md border border-white/10 px-2 py-2">
                                        <p className="text-[0.68rem] uppercase tracking-[0.16em] text-slate-500">Recall</p>
                                        <p className="mt-1 text-sm font-semibold text-white">{formatQualityPercent(selectedRepoSearchQuality.recall_at_k)}</p>
                                      </div>
                                      <div className="min-w-0 rounded-md border border-white/10 px-2 py-2">
                                        <p className="text-[0.68rem] uppercase tracking-[0.16em] text-slate-500">MRR</p>
                                        <p className="mt-1 text-sm font-semibold text-white">{selectedRepoSearchQuality.mrr.toFixed(2)}</p>
                                      </div>
                                      <div className="min-w-0 rounded-md border border-white/10 px-2 py-2">
                                        <p className="text-[0.68rem] uppercase tracking-[0.16em] text-slate-500">Cases</p>
                                        <p className="mt-1 text-sm font-semibold text-white">{selectedRepoSearchQuality.passed}/{selectedRepoSearchQuality.total}</p>
                                      </div>
                                    </div>

                                    {selectedRepoSearchQuality.baseline && (
                                      <div
                                        data-ui="search-quality-baseline"
                                        className={`min-w-0 rounded-md border px-3 py-2 text-xs ${
                                          selectedRepoSearchQuality.baseline.met
                                            ? 'border-emerald-300/20 bg-emerald-400/10 text-emerald-100'
                                            : 'border-red-300/20 bg-red-500/10 text-red-100'
                                        }`}
                                      >
                                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                                          <span className="shrink-0 font-semibold uppercase tracking-[0.14em]">
                                            {selectedRepoSearchQuality.baseline.met ? 'Baseline met' : 'Below baseline'}
                                          </span>
                                          <span className="min-w-0 break-words font-mono text-[0.68rem] [overflow-wrap:anywhere]">
                                            {formatQualityBaselineSummary(selectedRepoSearchQuality.baseline)}
                                          </span>
                                        </div>
                                      </div>
                                    )}

                                    {selectedRepoSearchQuality.warnings.length > 0 && (
                                      <p className="rounded-md border border-amber-300/20 bg-amber-400/10 px-3 py-2 text-xs text-amber-100">
                                        {selectedRepoSearchQuality.warnings[0]}
                                      </p>
                                    )}

                                    {selectedRepoSearchQuality.results.length > 0 && (
                                      <ul className="space-y-2">
                                        {selectedRepoSearchQuality.results.slice(0, 5).map((item) => (
                                          <li key={`${item.source}:${item.query}`} className="min-w-0 rounded-md border border-white/10 px-2 py-2">
                                            <div className="flex min-w-0 flex-wrap items-center gap-2">
                                              <span className={`shrink-0 rounded px-2 py-0.5 text-[0.68rem] font-semibold uppercase ${
                                                item.passed ? 'bg-emerald-400/15 text-emerald-100' : 'bg-red-400/15 text-red-100'
                                              }`}>
                                                {item.passed ? `rank ${item.rank}` : 'miss'}
                                              </span>
                                              <span className="shrink-0 rounded bg-white/10 px-2 py-0.5 text-[0.68rem] font-semibold uppercase text-slate-300">
                                                {item.source}
                                              </span>
                                              <span className="min-w-0 break-words font-mono text-xs text-slate-100 [overflow-wrap:anywhere]">
                                                {item.query}
                                              </span>
                                            </div>
                                            <p className="mt-1 min-w-0 break-words text-[0.68rem] text-slate-500 [overflow-wrap:anywhere]">
                                              expected {item.expected.path || item.expected.symbol || item.expected.type || 'match'} · {item.elapsed_ms.toFixed(1)} ms
                                            </p>
                                            {item.top_results[0] && (
                                              <p className="mt-1 min-w-0 break-words text-[0.68rem] text-slate-400 [overflow-wrap:anywhere]">
                                                top {item.top_results[0].path} :: {item.top_results[0].symbol}
                                              </p>
                                            )}
                                          </li>
                                        ))}
                                      </ul>
                                    )}
                                  </div>
                                )}
                              </div>

                              <div data-ui="storage-profile" className="min-w-0">
                                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                                  <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-slate-500">
                                    <HardDrive className="h-4 w-4 text-blue-200" />
                                    Storage
                                  </div>
                                  <button
                                    data-ui="storage-profile-run"
                                    type="button"
                                    onClick={() => handleLoadStorageProfile(selectedRepo)}
                                    disabled={loadingStorageProfileRepoId === selectedRepo.id}
                                    className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-white/10 px-3 text-xs font-semibold uppercase tracking-[0.14em] text-slate-300 transition-colors hover:border-white/25 hover:text-white disabled:cursor-wait disabled:opacity-60"
                                  >
                                    <HardDrive className={`h-3.5 w-3.5 ${loadingStorageProfileRepoId === selectedRepo.id ? 'animate-pulse' : ''}`} />
                                    <span>{loadingStorageProfileRepoId === selectedRepo.id ? 'Reading' : 'Profile'}</span>
                                  </button>
                                </div>

                                {selectedStorageProfileError && loadingStorageProfileRepoId !== selectedRepo.id && (
                                  <p className="rounded-md border border-red-300/20 bg-red-500/10 px-3 py-2 text-xs text-red-100">{selectedStorageProfileError}</p>
                                )}

                                {!selectedRepoStorageProfile && loadingStorageProfileRepoId !== selectedRepo.id && !selectedStorageProfileError && (
                                  <p className="rounded-md border border-white/10 px-3 py-2 text-xs text-slate-500">Profile artifact bytes and source blob compression</p>
                                )}

                                {selectedRepoStorageProfile && (
                                  <div className="space-y-2">
                                    <div className="grid grid-cols-3 gap-2">
                                      <div className="min-w-0 rounded-md border border-white/10 px-2 py-2">
                                        <p className="text-[0.68rem] uppercase tracking-[0.16em] text-slate-500">Total</p>
                                        <p className="mt-1 text-sm font-semibold text-white">{formatBytes(selectedRepoStorageProfile.total_bytes)}</p>
                                      </div>
                                      <div className="min-w-0 rounded-md border border-white/10 px-2 py-2">
                                        <p className="text-[0.68rem] uppercase tracking-[0.16em] text-slate-500">Blobs</p>
                                        <p className="mt-1 text-sm font-semibold text-white">{formatQualityPercent(selectedRepoStorageProfile.blob_coverage)}</p>
                                      </div>
                                      <div className="min-w-0 rounded-md border border-white/10 px-2 py-2">
                                        <p className="text-[0.68rem] uppercase tracking-[0.16em] text-slate-500">Ratio</p>
                                        <p className="mt-1 text-sm font-semibold text-white">{formatQualityPercent(selectedRepoStorageProfile.blob_compression_ratio)}</p>
                                      </div>
                                    </div>

                                    <div className="grid gap-2 sm:grid-cols-2">
                                      {Object.entries(selectedRepoStorageProfile.artifact_bytes).slice(0, 6).map(([bucket, bytes]) => (
                                        <div key={bucket} className="min-w-0 rounded-md border border-white/10 px-2 py-2">
                                          <p className="text-[0.68rem] uppercase tracking-[0.14em] text-slate-500">{bucket.replace(/_/g, ' ')}</p>
                                          <p className="mt-1 text-xs font-semibold text-slate-100">{formatBytes(bytes)}</p>
                                        </div>
                                      ))}
                                    </div>

                                    <p className="rounded-md border border-white/10 px-3 py-2 text-xs text-slate-400">
                                      {formatBytes(selectedRepoStorageProfile.blob_compressed_bytes)} compressed from {formatBytes(selectedRepoStorageProfile.blob_uncompressed_bytes)} source; max sampled read {selectedRepoStorageProfile.sampled_decompress_ms_max.toFixed(2)} ms
                                    </p>

                                    {selectedRepoStorageProfile.sampled_blobs.length > 0 && (
                                      <ul className="space-y-2">
                                        {selectedRepoStorageProfile.sampled_blobs.slice(0, 4).map((sample) => (
                                          <li key={sample.path} className="min-w-0 rounded-md border border-white/10 px-2 py-2">
                                            <div className="flex min-w-0 flex-wrap items-center gap-2">
                                              <span className="shrink-0 rounded bg-white/10 px-2 py-0.5 text-[0.68rem] font-semibold uppercase text-slate-300">
                                                {sample.compression}
                                              </span>
                                              <span className="min-w-0 break-words font-mono text-xs text-slate-100 [overflow-wrap:anywhere]">
                                                {sample.path}
                                              </span>
                                            </div>
                                            <p className="mt-1 min-w-0 break-words text-[0.68rem] text-slate-500 [overflow-wrap:anywhere]">
                                              {formatBytes(sample.compressed_bytes)} / {formatBytes(sample.uncompressed_bytes)} · {sample.decompress_ms.toFixed(2)} ms
                                            </p>
                                          </li>
                                        ))}
                                      </ul>
                                    )}
                                  </div>
                                )}
                              </div>

                              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
                                <div className="min-w-0">
                                  <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-slate-500">
                                    <BookOpen className="h-4 w-4 text-blue-200" />
                                    Docs
                                  </div>
                                  <ul className="space-y-2">
                                    {selectedOverview.docs.slice(0, 4).map((item) => (
                                      <li key={item.path} className="min-w-0">
                                        <p className="truncate text-sm text-slate-200" title={item.path}>{item.path}</p>
                                        <p className="text-xs text-slate-500">{item.detail}</p>
                                      </li>
                                    ))}
                                    {selectedOverview.docs.length === 0 && (
                                      <li className="text-xs text-slate-500">No docs indexed</li>
                                    )}
                                  </ul>
                                </div>

                                <div className="min-w-0">
                                  <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-slate-500">
                                    <Settings className="h-4 w-4 text-blue-200" />
                                    Config
                                  </div>
                                  <ul className="space-y-2">
                                    {selectedOverview.configs.slice(0, 4).map((item) => (
                                      <li key={item.path} className="min-w-0">
                                        <p className="truncate text-sm text-slate-200" title={item.path}>{item.path}</p>
                                        <p className="text-xs text-slate-500">{item.detail}</p>
                                      </li>
                                    ))}
                                    {selectedOverview.configs.length === 0 && (
                                      <li className="text-xs text-slate-500">No config files indexed</li>
                                    )}
                                  </ul>
                                </div>
                              </div>

                              <div>
                                <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-slate-500">
                                  <Package className="h-4 w-4 text-blue-200" />
                                  Manifests
                                </div>
                                <ul className="space-y-2">
                                  {(selectedOverview.dependency_manifests ?? []).slice(0, 4).map((manifest) => (
                                    <li key={`${manifest.source_path}:${manifest.package_manager}`} className="min-w-0">
                                      <p className="truncate text-sm text-slate-200" title={`${manifest.ecosystem} - ${manifest.package_manager}`}>
                                        {manifest.ecosystem} - {manifest.package_manager}
                                      </p>
                                      <p className="truncate text-xs text-slate-500" title={manifest.source_path}>
                                        {manifest.dependency_count} runtime / {manifest.dev_dependency_count} dev - {manifest.source_path}
                                      </p>
                                    </li>
                                  ))}
                                  {(selectedOverview.dependency_manifests ?? []).length === 0 && (
                                    <li className="text-xs text-slate-500">No manifests indexed</li>
                                  )}
                                </ul>
                              </div>

                              <div>
                                <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-slate-500">
                                  <Package className="h-4 w-4 text-blue-200" />
                                  Dependencies
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  {(selectedOverview.dependencies ?? []).slice(0, 8).map((dependency) => (
                                    <span
                                      key={`${dependency.source_path}:${dependency.scope}:${dependency.name}`}
                                      className="max-w-full truncate rounded-md border border-white/10 px-2 py-1 text-xs text-slate-200"
                                      title={`${dependency.ecosystem} ${dependency.scope} - ${dependency.source_path}`}
                                    >
                                      {dependency.name}
                                    </span>
                                  ))}
                                  {(selectedOverview.dependencies ?? []).length === 0 && (
                                    <span className="text-xs text-slate-500">No dependencies indexed</span>
                                  )}
                                </div>
                              </div>

                              <div>
                                <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-slate-500">
                                  <Wrench className="h-4 w-4 text-blue-200" />
                                  Stack
                                </div>
                                <ul className="space-y-2">
                                  {(selectedOverview.stack_components ?? []).slice(0, 6).map((component) => (
                                    <li key={`${component.source_path}:${component.category}:${component.name}`} className="min-w-0">
                                      <p className="truncate text-sm text-slate-200" title={`${component.name} - ${component.category}`}>
                                        {component.name} - {component.category}
                                      </p>
                                      <p className="truncate text-xs text-slate-500" title={component.detail || component.source_path}>
                                        {component.ecosystem || 'stack'} - {component.source_path}{component.line ? `:${component.line}` : ''}
                                      </p>
                                    </li>
                                  ))}
                                  {(selectedOverview.stack_components ?? []).length === 0 && (
                                    <li className="text-xs text-slate-500">No stack components indexed</li>
                                  )}
                                </ul>
                              </div>

                              <div>
                                <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-slate-500">
                                  <Zap className="h-4 w-4 text-blue-200" />
                                  Integrations
                                </div>
                                <ul className="space-y-2">
                                  {(selectedOverview.service_integrations ?? []).slice(0, 6).map((integration) => (
                                    <li key={`${integration.source_path}:${integration.line}:${integration.category}:${integration.name}`} className="min-w-0">
                                      <p className="truncate text-sm text-slate-200" title={`${integration.name} - ${integration.category}`}>
                                        {integration.name} - {integration.category}
                                      </p>
                                      <p className="truncate text-xs text-slate-500" title={integration.detail || integration.source_path}>
                                        {integration.source_path}{integration.line ? `:${integration.line}` : ''} - {integration.source || 'signal'}
                                      </p>
                                    </li>
                                  ))}
                                  {(selectedOverview.service_integrations ?? []).length === 0 && (
                                    <li className="text-xs text-slate-500">No service integrations indexed</li>
                                  )}
                                </ul>
                              </div>

                              <div>
                                <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-slate-500">
                                  <FileCode2 className="h-4 w-4 text-blue-200" />
                                  GraphQL
                                </div>
                                <ul className="space-y-2">
                                  {(selectedOverview.graphql_surfaces ?? []).slice(0, 6).map((surface) => (
                                    <li key={`${surface.source_path}:${surface.line}:${surface.category}:${surface.name}`} className="min-w-0">
                                      <p className="truncate text-sm text-slate-200" title={`${surface.name} - ${surface.category}`}>
                                        {surface.name} - {surface.category}
                                      </p>
                                      <p className="truncate text-xs text-slate-500" title={surface.detail || surface.source_path}>
                                        {surface.source_path}{surface.line ? `:${surface.line}` : ''} - {surface.source || 'signal'}
                                      </p>
                                    </li>
                                  ))}
                                  {(selectedOverview.graphql_surfaces ?? []).length === 0 && (
                                    <li className="text-xs text-slate-500">No GraphQL surfaces indexed</li>
                                  )}
                                </ul>
                              </div>

                              <div>
                                <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-slate-500">
                                  <GitBranch className="h-4 w-4 text-blue-200" />
                                  Events
                                </div>
                                <ul className="space-y-2">
                                  {(selectedOverview.message_buses ?? []).slice(0, 6).map((bus) => (
                                    <li key={`${bus.source_path}:${bus.line}:${bus.category}:${bus.name}`} className="min-w-0">
                                      <p className="truncate text-sm text-slate-200" title={`${bus.name} - ${bus.category}`}>
                                        {bus.name} - {bus.category}
                                      </p>
                                      <p className="truncate text-xs text-slate-500" title={bus.detail || bus.source_path}>
                                        {bus.source_path}{bus.line ? `:${bus.line}` : ''} - {bus.source || 'signal'}
                                      </p>
                                    </li>
                                  ))}
                                  {(selectedOverview.message_buses ?? []).length === 0 && (
                                    <li className="text-xs text-slate-500">No message buses indexed</li>
                                  )}
                                </ul>
                              </div>

                              <div>
                                <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-slate-500">
                                  <Database className="h-4 w-4 text-blue-200" />
                                  Data Stores
                                </div>
                                <ul className="space-y-2">
                                  {(selectedOverview.data_stores ?? []).slice(0, 6).map((store) => (
                                    <li key={`${store.source_path}:${store.line}:${store.category}:${store.name}`} className="min-w-0">
                                      <p className="truncate text-sm text-slate-200" title={`${store.name} - ${store.category}`}>
                                        {store.name} - {store.category}
                                      </p>
                                      <p className="truncate text-xs text-slate-500" title={store.detail || store.source_path}>
                                        {store.source_path}{store.line ? `:${store.line}` : ''} - {store.source || 'signal'}
                                      </p>
                                    </li>
                                  ))}
                                  {(selectedOverview.data_stores ?? []).length === 0 && (
                                    <li className="text-xs text-slate-500">No data stores indexed</li>
                                  )}
                                </ul>
                              </div>

                              <div>
                                <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-slate-500">
                                  <Bot className="h-4 w-4 text-blue-200" />
                                  AI
                                </div>
                                <ul className="space-y-2">
                                  {(selectedOverview.ai_surfaces ?? []).slice(0, 6).map((surface) => (
                                    <li key={`${surface.source_path}:${surface.line}:${surface.category}:${surface.name}`} className="min-w-0">
                                      <p className="truncate text-sm text-slate-200" title={`${surface.name} - ${surface.category}`}>
                                        {surface.name} - {surface.category}
                                      </p>
                                      <p className="truncate text-xs text-slate-500" title={surface.detail || surface.source_path}>
                                        {surface.source_path}{surface.line ? `:${surface.line}` : ''} - {surface.source || 'signal'}
                                      </p>
                                    </li>
                                  ))}
                                  {(selectedOverview.ai_surfaces ?? []).length === 0 && (
                                    <li className="text-xs text-slate-500">No AI surfaces indexed</li>
                                  )}
                                </ul>
                              </div>

                              <div>
                                <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-slate-500">
                                  <ShieldCheck className="h-4 w-4 text-blue-200" />
                                  Auth
                                </div>
                                <ul className="space-y-2">
                                  {(selectedOverview.auth_surfaces ?? []).slice(0, 6).map((surface) => (
                                    <li key={`${surface.source_path}:${surface.line}:${surface.category}:${surface.name}`} className="min-w-0">
                                      <p className="truncate text-sm text-slate-200" title={`${surface.name} - ${surface.category}`}>
                                        {surface.name} - {surface.category}
                                      </p>
                                      <p className="truncate text-xs text-slate-500" title={surface.detail || surface.source_path}>
                                        {surface.source_path}{surface.line ? `:${surface.line}` : ''} - {surface.source || 'signal'}
                                      </p>
                                    </li>
                                  ))}
                                  {(selectedOverview.auth_surfaces ?? []).length === 0 && (
                                    <li className="text-xs text-slate-500">No auth surfaces indexed</li>
                                  )}
                                </ul>
                              </div>

                              <div>
                                <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-slate-500">
                                  <CreditCard className="h-4 w-4 text-blue-200" />
                                  Payments
                                </div>
                                <ul className="space-y-2">
                                  {(selectedOverview.payment_surfaces ?? []).slice(0, 6).map((surface) => (
                                    <li key={`${surface.source_path}:${surface.line}:${surface.category}:${surface.name}`} className="min-w-0">
                                      <p className="truncate text-sm text-slate-200" title={`${surface.name} - ${surface.category}`}>
                                        {surface.name} - {surface.category}
                                      </p>
                                      <p className="truncate text-xs text-slate-500" title={surface.detail || surface.source_path}>
                                        {surface.source_path}{surface.line ? `:${surface.line}` : ''} - {surface.source || 'signal'}
                                      </p>
                                    </li>
                                  ))}
                                  {(selectedOverview.payment_surfaces ?? []).length === 0 && (
                                    <li className="text-xs text-slate-500">No payment surfaces indexed</li>
                                  )}
                                </ul>
                              </div>

                              <div>
                                <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-slate-500">
                                  <Clock3 className="h-4 w-4 text-blue-200" />
                                  Jobs
                                </div>
                                <ul className="space-y-2">
                                  {(selectedOverview.background_jobs ?? []).slice(0, 6).map((job) => (
                                    <li key={`${job.source_path}:${job.line}:${job.category}:${job.name}`} className="min-w-0">
                                      <p className="truncate text-sm text-slate-200" title={`${job.name} - ${job.category}`}>
                                        {job.name} - {job.category}
                                      </p>
                                      <p className="truncate text-xs text-slate-500" title={job.detail || job.source_path}>
                                        {job.source_path}{job.line ? `:${job.line}` : ''} - {job.source || 'signal'}
                                      </p>
                                    </li>
                                  ))}
                                  {(selectedOverview.background_jobs ?? []).length === 0 && (
                                    <li className="text-xs text-slate-500">No background jobs indexed</li>
                                  )}
                                </ul>
                              </div>

                              <div>
                                <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-slate-500">
                                  <MessageCircle className="h-4 w-4 text-blue-200" />
                                  Webhooks
                                </div>
                                <ul className="space-y-2">
                                  {(selectedOverview.webhook_surfaces ?? []).slice(0, 6).map((webhook) => (
                                    <li key={`${webhook.source_path}:${webhook.line}:${webhook.category}:${webhook.name}`} className="min-w-0">
                                      <p className="truncate text-sm text-slate-200" title={`${webhook.name} - ${webhook.category}`}>
                                        {webhook.name} - {webhook.category}
                                      </p>
                                      <p className="truncate text-xs text-slate-500" title={webhook.detail || webhook.source_path}>
                                        {webhook.source_path}{webhook.line ? `:${webhook.line}` : ''} - {webhook.source || 'signal'}
                                      </p>
                                    </li>
                                  ))}
                                  {(selectedOverview.webhook_surfaces ?? []).length === 0 && (
                                    <li className="text-xs text-slate-500">No webhook surfaces indexed</li>
                                  )}
                                </ul>
                              </div>

                              <div>
                                <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-slate-500">
                                  <Activity className="h-4 w-4 text-blue-200" />
                                  Observability
                                </div>
                                <ul className="space-y-2">
                                  {(selectedOverview.observability_surfaces ?? []).slice(0, 6).map((surface) => (
                                    <li key={`${surface.source_path}:${surface.line}:${surface.category}:${surface.name}`} className="min-w-0">
                                      <p className="truncate text-sm text-slate-200" title={`${surface.name} - ${surface.category}`}>
                                        {surface.name} - {surface.category}
                                      </p>
                                      <p className="truncate text-xs text-slate-500" title={surface.detail || surface.source_path}>
                                        {surface.source_path}{surface.line ? `:${surface.line}` : ''} - {surface.source || 'signal'}
                                      </p>
                                    </li>
                                  ))}
                                  {(selectedOverview.observability_surfaces ?? []).length === 0 && (
                                    <li className="text-xs text-slate-500">No observability surfaces indexed</li>
                                  )}
                                </ul>
                              </div>

                              <div>
                                <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-slate-500">
                                  <Flag className="h-4 w-4 text-blue-200" />
                                  Feature Flags
                                </div>
                                <ul className="space-y-2">
                                  {(selectedOverview.feature_flags ?? []).slice(0, 6).map((flag) => (
                                    <li key={`${flag.source_path}:${flag.line}:${flag.category}:${flag.name}`} className="min-w-0">
                                      <p className="truncate text-sm text-slate-200" title={`${flag.name} - ${flag.category}`}>
                                        {flag.name} - {flag.category}
                                      </p>
                                      <p className="truncate text-xs text-slate-500" title={flag.detail || flag.source_path}>
                                        {flag.source_path}{flag.line ? `:${flag.line}` : ''} - {flag.source || 'signal'}
                                      </p>
                                    </li>
                                  ))}
                                  {(selectedOverview.feature_flags ?? []).length === 0 && (
                                    <li className="text-xs text-slate-500">No feature flags indexed</li>
                                  )}
                                </ul>
                              </div>

                              <div>
                                <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-slate-500">
                                  <BellRing className="h-4 w-4 text-blue-200" />
                                  Notifications
                                </div>
                                <ul className="space-y-2">
                                  {(selectedOverview.notification_surfaces ?? []).slice(0, 6).map((surface) => (
                                    <li key={`${surface.source_path}:${surface.line}:${surface.category}:${surface.name}`} className="min-w-0">
                                      <p className="truncate text-sm text-slate-200" title={`${surface.name} - ${surface.category}`}>
                                        {surface.name} - {surface.category}
                                      </p>
                                      <p className="truncate text-xs text-slate-500" title={surface.detail || surface.source_path}>
                                        {surface.source_path}{surface.line ? `:${surface.line}` : ''} - {surface.source || 'signal'}
                                      </p>
                                    </li>
                                  ))}
                                  {(selectedOverview.notification_surfaces ?? []).length === 0 && (
                                    <li className="text-xs text-slate-500">No notification surfaces indexed</li>
                                  )}
                                </ul>
                              </div>

                              <div>
                                <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-slate-500">
                                  <Wrench className="h-4 w-4 text-blue-200" />
                                  Runtime
                                </div>
                                <ul className="space-y-2">
                                  {(selectedOverview.runtime_requirements ?? []).slice(0, 5).map((runtime) => (
                                    <li key={`${runtime.source_path}:${runtime.line}:${runtime.runtime}:${runtime.requirement}`} className="min-w-0">
                                      <p className="truncate text-sm text-slate-200" title={`${runtime.runtime} ${runtime.requirement}`}>
                                        {runtime.runtime} {runtime.requirement}
                                      </p>
                                      <p className="truncate text-xs text-slate-500" title={runtime.detail || runtime.source_path}>
                                        {runtime.source_path}{runtime.line ? `:${runtime.line}` : ''}{runtime.detail ? ` - ${runtime.detail}` : ''}
                                      </p>
                                    </li>
                                  ))}
                                  {(selectedOverview.runtime_requirements ?? []).length === 0 && (
                                    <li className="text-xs text-slate-500">No runtime requirements indexed</li>
                                  )}
                                </ul>
                              </div>

                              <div>
                                <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-slate-500">
                                  <AlertCircle className="h-4 w-4 text-blue-200" />
                                  Secrets
                                </div>
                                <ul className="space-y-2">
                                  {(selectedOverview.secret_signals ?? []).slice(0, 5).map((signal) => (
                                    <li key={`${signal.source_path}:${signal.line}:${signal.name}`} className="min-w-0">
                                      <p className="truncate text-sm text-slate-200" title={`${signal.category}: ${signal.name}`}>
                                        {signal.category}: {signal.name}
                                      </p>
                                      <p className="truncate text-xs text-slate-500" title={signal.detail || signal.source_path}>
                                        {signal.source_path}{signal.line ? `:${signal.line}` : ''} - value redacted
                                      </p>
                                    </li>
                                  ))}
                                  {(selectedOverview.secret_signals ?? []).length === 0 && (
                                    <li className="text-xs text-slate-500">No secret signals indexed</li>
                                  )}
                                </ul>
                              </div>

                              <div>
                                <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-slate-500">
                                  <GitBranch className="h-4 w-4 text-blue-200" />
                                  Deploy
                                </div>
                                <ul className="space-y-2">
                                  {(selectedOverview.deploy_targets ?? []).slice(0, 5).map((target) => (
                                    <li key={`${target.source_path}:${target.line}:${target.provider}:${target.target_type}:${target.name}`} className="min-w-0">
                                      <p className="truncate text-sm text-slate-200" title={`${target.provider} ${target.target_type}: ${target.name}`}>
                                        {target.provider} {target.target_type}: {target.name}
                                      </p>
                                      <p className="truncate text-xs text-slate-500" title={target.detail || target.source_path}>
                                        {target.source_path}{target.line ? `:${target.line}` : ''}{target.detail ? ` - ${target.detail}` : ''}
                                      </p>
                                    </li>
                                  ))}
                                  {(selectedOverview.deploy_targets ?? []).length === 0 && (
                                    <li className="text-xs text-slate-500">No deployment targets indexed</li>
                                  )}
                                </ul>
                              </div>

                              <div>
                                <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-slate-500">
                                  <ClipboardList className="h-4 w-4 text-blue-200" />
                                  Policy
                                </div>
                                <ul className="space-y-2">
                                  {(selectedOverview.repo_policies ?? []).slice(0, 4).map((policy) => (
                                    <li key={`${policy.source_path}:${policy.line}:${policy.policy_type}:${policy.value}`} className="min-w-0">
                                      <p className="truncate text-sm text-slate-200" title={`${policy.policy_type}: ${policy.value}`}>
                                        {policy.policy_type}: {policy.value}
                                      </p>
                                      <p className="truncate text-xs text-slate-500" title={policy.detail || policy.source_path}>
                                        {policy.source_path}{policy.line ? `:${policy.line}` : ''}
                                      </p>
                                    </li>
                                  ))}
                                  {(selectedOverview.code_owners ?? []).slice(0, 3).map((owner) => (
                                    <li key={`${owner.source_path}:${owner.line}:${owner.pattern}`} className="min-w-0">
                                      <p className="truncate text-sm text-slate-200" title={`${owner.pattern} ${owner.owners.join(' ')}`}>
                                        {owner.pattern}
                                      </p>
                                      <p className="truncate text-xs text-slate-500" title={owner.owners.join(' ')}>
                                        {owner.owners.join(' ')} - {owner.source_path}{owner.line ? `:${owner.line}` : ''}
                                      </p>
                                    </li>
                                  ))}
                                  {(selectedOverview.repo_policies ?? []).length === 0 && (selectedOverview.code_owners ?? []).length === 0 && (
                                    <li className="text-xs text-slate-500">No policy or owner facts indexed</li>
                                  )}
                                </ul>
                              </div>

                              <div>
                                <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-slate-500">
                                  <Check className="h-4 w-4 text-blue-200" />
                                  Tests
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  {selectedOverview.tests.slice(0, 4).map((item) => (
                                    <span key={item.path} className="max-w-full truncate rounded-md border border-white/10 px-2 py-1 text-xs text-slate-200" title={item.path}>
                                      {item.path}
                                    </span>
                                  ))}
                                  {selectedOverview.tests.length === 0 && (
                                    <span className="text-xs text-slate-500">No tests indexed</span>
                                  )}
                                </div>
                              </div>

                              <div>
                                <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-slate-500">
                                  <FileCode2 className="h-4 w-4 text-blue-200" />
                                  Symbols
                                </div>
                                <div className="flex flex-wrap gap-2">
                                  {Object.entries(selectedOverview.symbol_types).slice(0, 5).map(([type, count]) => (
                                    <span key={type} className="rounded-md border border-white/10 px-2 py-1 text-xs text-slate-200">
                                      {type}: {count}
                                    </span>
                                  ))}
                                </div>
                              </div>

                              <div data-ui="repo-facts" className="min-w-0">
                                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                                  <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-slate-500">
                                    <Database className="h-4 w-4 text-blue-200" />
                                    Facts
                                  </div>
                                  {selectedRepoFacts && (
                                    <span className="rounded-md border border-white/10 px-2 py-1 text-[0.68rem] uppercase tracking-[0.16em] text-slate-500">
                                      {selectedRepoFacts.total}
                                    </span>
                                  )}
                                </div>

                                <div data-ui="fact-filter" className="mb-3 flex flex-wrap gap-2">
                                  {FACT_KIND_OPTIONS.map((option) => {
                                    const isActive = selectedFactKind === option.value;
                                    return (
                                      <button
                                        key={option.value || 'all'}
                                        type="button"
                                        onClick={() => setSelectedFactKind(option.value)}
                                        className={`min-h-10 rounded-lg border px-3 text-xs font-semibold uppercase tracking-[0.14em] transition-colors ${
                                          isActive
                                            ? 'border-blue-300/70 bg-blue-400/15 text-blue-50'
                                            : 'border-white/10 text-slate-400 hover:border-white/25 hover:text-slate-100'
                                        }`}
                                      >
                                        {option.label}
                                      </button>
                                    );
                                  })}
                                </div>

                                {loadingFactsKey === selectedFactsKey && (
                                  <p className="rounded-md border border-white/10 px-3 py-2 text-xs text-slate-500">Loading facts</p>
                                )}

                                {selectedFactError && loadingFactsKey !== selectedFactsKey && (
                                  <p className="rounded-md border border-red-300/20 bg-red-500/10 px-3 py-2 text-xs text-red-100">{selectedFactError}</p>
                                )}

                                {selectedRepoFacts && loadingFactsKey !== selectedFactsKey && selectedRepoFacts.facts.length === 0 && (
                                  <p className="rounded-md border border-white/10 px-3 py-2 text-xs text-slate-500">No facts indexed for this filter</p>
                                )}

                                {selectedRepoFacts && selectedRepoFacts.facts.length > 0 && (
                                  <ul className="space-y-2">
                                    {selectedRepoFacts.facts.slice(0, 10).map((fact) => (
                                      <li key={fact.id} className="min-w-0 rounded-md border border-white/10 px-2 py-2">
                                        <div className="flex min-w-0 flex-wrap items-center gap-2">
                                          <span className="shrink-0 rounded bg-white/10 px-2 py-0.5 text-[0.68rem] font-semibold uppercase text-slate-200">
                                            {formatFactKind(fact.kind)}
                                          </span>
                                          <span className="min-w-0 break-words font-mono text-xs text-slate-100">
                                            {fact.key}
                                          </span>
                                        </div>
                                        <p className="mt-1 min-w-0 break-words text-xs text-slate-400">
                                          {fact.value}
                                        </p>
                                        {(fact.source_path || fact.source_line) && (
                                          <p className="mt-1 min-w-0 break-words text-[0.68rem] text-slate-500">
                                            {fact.source_path || '(repo)'}{fact.source_line ? `:${fact.source_line}` : ''}
                                          </p>
                                        )}
                                      </li>
                                    ))}
                                  </ul>
                                )}
                              </div>

                              <div data-ui="repo-relationships" className="min-w-0">
                                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                                  <div className="flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-slate-500">
                                    <GitBranch className="h-4 w-4 text-blue-200" />
                                    Relationships
                                  </div>
                                  {selectedRepoRelationships && (
                                    <span className="rounded-md border border-white/10 px-2 py-1 text-[0.68rem] uppercase tracking-[0.16em] text-slate-500">
                                      {selectedRepoRelationships.total}
                                    </span>
                                  )}
                                </div>

                                <div data-ui="relationship-filter" className="mb-3 flex flex-wrap gap-2">
                                  {RELATIONSHIP_TYPE_OPTIONS.map((option) => {
                                    const isActive = selectedRelationshipType === option.value;
                                    return (
                                      <button
                                        key={option.value || 'all'}
                                        type="button"
                                        onClick={() => setSelectedRelationshipType(option.value)}
                                        className={`min-h-11 rounded-lg border px-3 text-xs font-semibold uppercase tracking-[0.14em] transition-colors ${
                                          isActive
                                            ? 'border-blue-300/70 bg-blue-400/15 text-blue-50'
                                            : 'border-white/10 text-slate-400 hover:border-white/25 hover:text-slate-100'
                                        }`}
                                      >
                                        {option.label}
                                      </button>
                                    );
                                  })}
                                </div>

                                {loadingRelationshipsKey === selectedRelationshipsKey && (
                                  <p className="rounded-md border border-white/10 px-3 py-2 text-xs text-slate-500">Loading relationships</p>
                                )}

                                {selectedRelationshipError && loadingRelationshipsKey !== selectedRelationshipsKey && (
                                  <p className="rounded-md border border-red-300/20 bg-red-500/10 px-3 py-2 text-xs text-red-100">{selectedRelationshipError}</p>
                                )}

                                {selectedRepoRelationships && loadingRelationshipsKey !== selectedRelationshipsKey && selectedRepoRelationships.relationships.length === 0 && (
                                  <p className="rounded-md border border-white/10 px-3 py-2 text-xs text-slate-500">No relationships indexed for this filter</p>
                                )}

                                {selectedRepoRelationships && selectedRepoRelationships.relationships.length > 0 && (
                                  <ul className="space-y-2">
                                    {selectedRepoRelationships.relationships.slice(0, 10).map((relationship) => {
                                      const metadataDetail = formatRelationshipMeta(relationship.metadata);
                                      return (
                                        <li key={relationship.id} className="min-w-0 rounded-md border border-white/10 px-2 py-2">
                                          <div className="flex min-w-0 flex-wrap items-center gap-2">
                                            <span className="shrink-0 rounded bg-white/10 px-2 py-0.5 text-[0.68rem] font-semibold uppercase text-slate-200">
                                              {formatRelationshipType(relationship.rel_type)}
                                            </span>
                                            <span className="shrink-0 rounded bg-blue-400/15 px-2 py-0.5 text-[0.68rem] font-semibold uppercase text-blue-100">
                                              {relationship.confidence}
                                            </span>
                                          </div>
                                          <p className="mt-2 min-w-0 break-words font-mono text-xs text-slate-100 [overflow-wrap:anywhere]">
                                            {relationship.target}
                                          </p>
                                          <p className="mt-1 min-w-0 break-words text-[0.68rem] text-slate-500 [overflow-wrap:anywhere]">
                                            {relationship.source_path || '(repo)'}{relationship.source_line != null ? `:${relationship.source_line}` : ''}
                                          </p>
                                          {metadataDetail && (
                                            <p className="mt-1 min-w-0 break-words text-[0.68rem] text-slate-400 [overflow-wrap:anywhere]">
                                              {metadataDetail}
                                            </p>
                                          )}
                                        </li>
                                      );
                                    })}
                                  </ul>
                                )}
                              </div>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                )}

                <div className="mt-8 flex flex-wrap items-center gap-4 text-sm text-slate-300">
                  <div className="pill-control">
                    <span className="pill-control__label">Results</span>
                    <ResultsSelect value={resultsLimit} options={[10, 20, 50, 100]} onChange={(value) => setResultsLimit(value)} />
                  </div>

                  <div className="relative" ref={languageDropdownRef}>
                    <button
                      data-ui="language-filter"
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
                      <div className="absolute left-0 z-50 mt-3 max-h-[min(18rem,34dvh)] w-[min(15rem,calc(100vw-2rem))] overflow-y-auto rounded-xl border border-white/10 bg-[#06080f]/95 p-2 text-sm shadow-[0_30px_80px_rgba(4,6,11,0.8)] sm:left-auto sm:right-0 sm:w-60">
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

                {!hasSearchableIndex && (
                  <div className="mt-6 rounded-xl border border-amber-400/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-100">
                    No searchable lexical index yet. Queue a repo or upload code to build the fast index first.
                  </div>
                )}

                {hasSearchableIndex && !hasSemanticIndex && (
                  <div className="mt-6 rounded-xl border border-blue-400/30 bg-blue-500/10 px-4 py-3 text-sm text-blue-100">
                    Lexical search is ready. Semantic vectors are unavailable or still warming, so searches avoid CodeBERT until vectors exist.
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
            onClick={handleCloseFilesModal}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.9, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="flex max-h-[86dvh] w-full min-w-0 max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl border border-white/10 bg-[#070a13] shadow-[0_30px_100px_rgba(0,0,0,0.6)] xl:max-w-6xl"
            >
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
                <div className="min-w-0">
                  <h2 className="truncate text-base font-semibold text-white">
                    {fileBrowserRepo ? fileBrowserRepo.name : 'Indexed files'}
                  </h2>
                  <p className="mt-1 text-xs text-slate-500">
                    {indexedFiles.length.toLocaleString()} files{fileBrowserRepo ? ' - source browser' : ' - legacy index'}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  {!fileBrowserRepo && (
                    <button
                      onClick={handleClearIndex}
                      disabled={isClearing}
                      className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-red-300/20 bg-red-500/10 px-3 text-sm text-red-200 transition-colors hover:bg-red-500/20 disabled:opacity-50"
                    >
                      <Trash2 className="h-4 w-4" />
                      {isClearing ? 'Clearing' : 'Clear'}
                    </button>
                  )}
                  <button
                    onClick={handleCloseFilesModal}
                    className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-white/10 text-slate-400 transition-colors hover:text-white"
                    aria-label="Close file browser"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>
              <div data-ui="file-browser" className="grid min-h-0 min-w-0 flex-1 overflow-hidden md:grid-cols-[minmax(0,0.92fr)_minmax(0,1.08fr)]">
                <div className="min-h-0 min-w-0 overflow-hidden border-b border-white/10 md:border-b-0 md:border-r">
                  {fileBrowserError && (
                    <p className="m-3 rounded-md border border-red-300/20 bg-red-500/10 px-3 py-2 text-xs text-red-100">
                      {fileBrowserError}
                    </p>
                  )}

                  {indexedFiles.length === 0 ? (
                    <div className="p-8 text-center text-sm text-slate-500">No files indexed yet</div>
                  ) : (
                    <div className="max-h-[34dvh] min-w-0 overflow-y-auto md:max-h-[calc(86dvh-5rem)]">
                      <ul className="divide-y divide-white/5">
                        {indexedFiles.map((file) => {
                          const isSelected = selectedRepoFile?.file.path === file.path;
                          const rowClass = `block w-full min-w-0 px-4 py-3 text-left transition-colors ${
                            isSelected
                              ? 'bg-blue-400/10 text-blue-50'
                              : 'text-slate-300 hover:bg-white/5'
                          }`;

                          const body = (
                            <>
                              <div className="flex min-w-0 items-center justify-between gap-3">
                                <span className="min-w-0 truncate font-mono text-sm" title={file.path}>{file.path}</span>
                                <span className="shrink-0 rounded bg-white/10 px-2 py-0.5 text-[0.68rem] font-semibold uppercase text-slate-300">
                                  {file.symbol_count}
                                </span>
                              </div>
                              <p className="mt-1 text-xs text-slate-500">
                                {file.total_lines.toLocaleString()} lines - {new Date(file.indexed_at).toLocaleDateString()}
                              </p>
                            </>
                          );

                          return (
                            <li key={file.id} className="min-w-0">
                              {fileBrowserRepo ? (
                                <button
                                  data-ui="file-row"
                                  type="button"
                                  onClick={() => handleOpenRepoFile(file)}
                                  className={rowClass}
                                >
                                  {body}
                                </button>
                              ) : (
                                <div className={rowClass}>{body}</div>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                </div>

                <div data-ui="file-source" className="min-h-0 overflow-y-auto p-4">
                  {!fileBrowserRepo && (
                    <div className="rounded-lg border border-white/10 px-4 py-3 text-sm text-slate-400">
                      Select a repo card first to inspect source files and outlines.
                    </div>
                  )}

                  {fileBrowserRepo && isLoadingRepoFile && (
                    <div className="rounded-lg border border-white/10 px-4 py-3 text-sm text-slate-400">
                      Loading source
                    </div>
                  )}

                  {fileBrowserRepo && !isLoadingRepoFile && !selectedRepoFile && (
                    <div className="rounded-lg border border-white/10 px-4 py-3 text-sm text-slate-400">
                      Choose a file to inspect its source and indexed symbol outline.
                    </div>
                  )}

                  {selectedRepoFile && (
                    <div className="min-w-0 space-y-4">
                      <div className="min-w-0">
                        <p className="min-w-0 break-words font-mono text-sm text-slate-100 [overflow-wrap:anywhere]">
                          {selectedRepoFile.file.path}
                        </p>
                        <p className="mt-1 text-xs text-slate-500">
                          {selectedRepoFile.file.total_lines.toLocaleString()} lines - {formatBytes(selectedRepoFile.size_bytes)}
                        </p>
                      </div>

                      <div>
                        <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-[0.18em] text-slate-500">
                          <FileCode2 className="h-4 w-4 text-blue-200" />
                          Outline
                        </div>
                        {selectedRepoFile.symbols.length === 0 ? (
                          <p className="text-xs text-slate-500">No symbols indexed for this file</p>
                        ) : (
                          <div className="flex flex-wrap gap-2">
                            {selectedRepoFile.symbols.slice(0, 18).map((symbol) => (
                              <span
                                key={symbol.id}
                                className="max-w-full truncate rounded-md border border-white/10 px-2 py-1 text-xs text-slate-200"
                                title={`${symbol.name} ${symbol.start_line}-${symbol.end_line}`}
                              >
                                {symbol.symbol_type}: {symbol.name}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      <pre className="max-h-[48dvh] min-w-0 overflow-y-auto whitespace-pre-wrap break-words rounded-lg border border-white/10 bg-black/30 p-3 font-mono text-xs leading-5 text-slate-200 [overflow-wrap:anywhere] md:max-h-[58dvh]">
                        {selectedRepoFile.content}
                      </pre>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default App;
