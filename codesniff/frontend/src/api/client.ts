/**
 * API client for CodeScope backend
 */

import axios, { AxiosInstance } from 'axios';

export interface SearchResult {
  symbol_name: string;
  symbol_type: string;
  file_path: string;
  code_snippet: string;
  start_line: number;
  end_line: number;
  similarity_score: number;
  docstring?: string;
  match_info?: string;
  highlighted_name?: string;
  highlighted_docstring?: string;
}

export interface SearchResponse {
  query: string;
  results: SearchResult[];
  total_results: number;
  search_time_ms: number;
}

export interface IndexStats {
  files_processed: number;
  files_failed: number;
  total_symbols: number;
  functions_indexed: number;
  classes_indexed: number;
  methods_indexed: number;
  total_lines: number;
  time_taken: number;
}

export interface IndexResponse {
  success: boolean;
  stats: IndexStats;
  message: string;
}

export interface StatsResponse {
  total_symbols: number;
  total_files: number;
  functions: number;
  classes: number;
  vector_count: number;
  ready: boolean;
  lexical_ready?: boolean;
  semantic_ready?: boolean;
  index_status?: string;
}

export interface HealthResponse {
  status: string;
  version: string;
  ready: boolean;
}

export interface SearchRequest {
  query: string;
  limit?: number;
  min_similarity?: number;
  symbol_type?: string;
  language_filter?: string[];
}

export interface IndexRequest {
  directory_path: string;
  show_progress?: boolean;
  semantic?: boolean;
}

export interface RepoResponse {
  id: number;
  name: string;
  source_type: string;
  source_url?: string;
  status: string;
  active_revision?: string;
  storage_path: string;
  created_at: string;
  updated_at: string;
  last_opened_at?: string;
  error_summary?: string;
  storage_bytes: number;
  total_symbols: number;
  total_files: number;
  lexical_ready: boolean;
  lexical_index_mode: string;
  semantic_ready: boolean;
  artifact_health: string;
  artifact_warnings: string[];
  source_available: boolean;
  source_pruned: boolean;
  source_retention_policy: string;
  refresh_interval_minutes?: number | null;
  next_refresh_at?: string | null;
  last_scheduled_refresh_at?: string | null;
}

export interface JobResponse {
  id: number;
  repo_id: number;
  kind: string;
  status: string;
  phase: string;
  files_seen: number;
  files_indexed: number;
  symbols_indexed: number;
  started_at?: string;
  finished_at?: string;
  error?: string;
  cancel_requested?: boolean;
}

export interface RepoIndexResponse {
  repo: RepoResponse;
  job: JobResponse;
  message: string;
}

export interface RepoOverviewLanguage {
  language: string;
  file_count: number;
  line_count: number;
  support_level: 'symbol-aware' | 'searchable' | 'mixed' | string;
  symbol_aware: boolean;
  searchable: boolean;
}

export interface RepoOverviewDirectory {
  path: string;
  file_count: number;
  line_count: number;
}

export interface RepoOverviewModule {
  path: string;
  file_count: number;
  line_count: number;
  symbol_count: number;
  languages: string[];
  sample_files: string[];
}

export interface RepoOverviewModuleDependency {
  source_module: string;
  target_module: string;
  source_path: string;
  target_path: string;
  source_line: number;
  import_count: number;
  sample_imports: Record<string, unknown>[];
}

export interface RepoOverviewFileFact {
  path: string;
  kind: string;
  detail: string;
  total_lines: number;
}

export interface RepoOverviewIndexFallback {
  path: string;
  reason: string;
  total_lines: number;
}

export interface RepoOverviewScript {
  name: string;
  command: string;
  source_path: string;
}

export interface RepoOverviewRoute {
  method: string;
  path: string;
  source_path: string;
  line: number;
  framework: string;
}

export interface RepoOverviewImport {
  source_path: string;
  target: string;
  target_path?: string | null;
  source_line: number;
  confidence: string;
  syntax: string;
}

export interface RepoOverviewDependencyManifest {
  ecosystem: string;
  package_manager: string;
  source_path: string;
  dependency_count: number;
  dev_dependency_count: number;
  detail: string;
}

export interface RepoOverviewRunCommand {
  category: string;
  name: string;
  command: string;
  source_path: string;
  detail: string;
}

export interface RepoOverviewDependency {
  name: string;
  ecosystem: string;
  scope: string;
  source_path: string;
}

export interface RepoOverviewWorkspace {
  name: string;
  path: string;
  workspace_kind: string;
  ecosystem: string;
  manager: string;
  source_path: string;
  line: number;
  detail: string;
}

export interface RepoOverviewStackComponent {
  name: string;
  category: string;
  ecosystem: string;
  source_path: string;
  line: number;
  source: string;
  detail: string;
}

export interface RepoOverviewServiceIntegration {
  name: string;
  category: string;
  source_path: string;
  line: number;
  source: string;
  detail: string;
}

export interface RepoOverviewGraphQLSurface {
  name: string;
  category: string;
  source_path: string;
  line: number;
  source: string;
  detail: string;
}

export interface RepoOverviewMessageBus {
  name: string;
  category: string;
  source_path: string;
  line: number;
  source: string;
  detail: string;
}

export interface RepoOverviewDataStore {
  name: string;
  category: string;
  source_path: string;
  line: number;
  source: string;
  detail: string;
}

export interface RepoOverviewAISurface {
  name: string;
  category: string;
  source_path: string;
  line: number;
  source: string;
  detail: string;
}

export interface RepoOverviewPaymentSurface {
  name: string;
  category: string;
  source_path: string;
  line: number;
  source: string;
  detail: string;
}

export interface RepoOverviewAuthSurface {
  name: string;
  category: string;
  source_path: string;
  line: number;
  source: string;
  detail: string;
}

export interface RepoOverviewBackgroundJob {
  name: string;
  category: string;
  source_path: string;
  line: number;
  source: string;
  detail: string;
}

export interface RepoOverviewWebhookSurface {
  name: string;
  category: string;
  source_path: string;
  line: number;
  source: string;
  detail: string;
}

export interface RepoOverviewObservabilitySurface {
  name: string;
  category: string;
  source_path: string;
  line: number;
  source: string;
  detail: string;
}

export interface RepoOverviewFeatureFlag {
  name: string;
  category: string;
  source_path: string;
  line: number;
  source: string;
  detail: string;
}

export interface RepoOverviewNotificationSurface {
  name: string;
  category: string;
  source_path: string;
  line: number;
  source: string;
  detail: string;
}

export interface RepoOverviewEnvVar {
  name: string;
  detail: string;
  source_path: string;
  line: number;
  source: string;
  service: string;
  required: boolean;
  has_default: boolean;
}

export interface RepoOverviewCIWorkflow {
  name: string;
  detail: string;
  source_path: string;
  line: number;
  provider: string;
  events: string[];
  jobs: string[];
  commands: string[];
}

export interface RepoOverviewContainerService {
  name: string;
  detail: string;
  source_path: string;
  line: number;
  provider: string;
  image: string;
  build: string;
  command: string;
  ports: string[];
  depends_on: string[];
}

export interface RepoOverviewRuntimeRequirement {
  runtime: string;
  requirement: string;
  source_path: string;
  line: number;
  source: string;
  detail: string;
}

export interface RepoOverviewInfraResource {
  provider: string;
  category: string;
  resource_type: string;
  name: string;
  source_path: string;
  line: number;
  source: string;
  detail: string;
}

export interface RepoOverviewApiContract {
  name: string;
  category: string;
  protocol: string;
  source_path: string;
  line: number;
  source: string;
  detail: string;
}

export interface RepoOverviewCliCommand {
  name: string;
  category: string;
  command: string;
  source_path: string;
  line: number;
  source: string;
  detail: string;
}

export interface RepoOverviewTestSystem {
  name: string;
  category: string;
  tool: string;
  command: string;
  source_path: string;
  line: number;
  source: string;
  detail: string;
}

export interface RepoOverviewReleaseProcess {
  name: string;
  category: string;
  tool: string;
  command: string;
  source_path: string;
  line: number;
  source: string;
  detail: string;
}

export interface RepoOverviewQualityTool {
  name: string;
  category: string;
  tool: string;
  command: string;
  source_path: string;
  line: number;
  source: string;
  detail: string;
}

export interface RepoOverviewDevEnvironment {
  name: string;
  category: string;
  tool: string;
  source_path: string;
  line: number;
  source: string;
  detail: string;
}

export interface RepoOverviewBuildSystem {
  name: string;
  category: string;
  tool: string;
  command: string;
  source_path: string;
  line: number;
  source: string;
  detail: string;
}

export interface RepoOverviewUiSurface {
  name: string;
  category: string;
  framework: string;
  source_path: string;
  line: number;
  source: string;
  detail: string;
}

export interface RepoOverviewMobileSurface {
  name: string;
  category: string;
  platform: string;
  source_path: string;
  line: number;
  source: string;
  detail: string;
}

export interface RepoOverviewPolicy {
  policy_type: string;
  name: string;
  value: string;
  source_path: string;
  line: number;
  source: string;
  detail: string;
}

export interface RepoOverviewCodeOwner {
  pattern: string;
  owners: string[];
  source_path: string;
  line: number;
  detail: string;
}

export interface RepoOverviewDeployTarget {
  provider: string;
  target_type: string;
  name: string;
  source_path: string;
  line: number;
  detail: string;
}

export interface RepoOverviewSupplyChain {
  name: string;
  category: string;
  tool: string;
  ecosystem: string;
  source_path: string;
  line: number;
  source: string;
  detail: string;
}

export interface RepoOverviewSecretSignal {
  name: string;
  category: string;
  source_path: string;
  line: number;
  source: string;
  has_value: boolean;
  detail: string;
}

export interface RepoOverviewMigrationFact {
  action: string;
  table: string;
  field: string;
  detail: string;
  source_path: string;
  line: number;
  source: string;
  framework: string;
  operation: string;
  name: string;
}

export interface RepoOverviewSymbol {
  name: string;
  symbol_type: string;
  path: string;
  start_line: number;
}

export interface RepoOverviewDocSection {
  source_path: string;
  line: number;
  level: number;
  title: string;
  anchor: string;
}

export interface RepoOverviewArchitectureDecision {
  name: string;
  category: string;
  status: string;
  source_path: string;
  line: number;
  source: string;
  detail: string;
}

export interface RepoOverviewResponse {
  repo_id: number;
  total_files: number;
  total_symbols: number;
  languages: RepoOverviewLanguage[];
  top_directories: RepoOverviewDirectory[];
  modules: RepoOverviewModule[];
  module_dependencies: RepoOverviewModuleDependency[];
  docs: RepoOverviewFileFact[];
  doc_sections: RepoOverviewDocSection[];
  architecture_decisions: RepoOverviewArchitectureDecision[];
  configs: RepoOverviewFileFact[];
  tests: RepoOverviewFileFact[];
  entry_points: RepoOverviewFileFact[];
  package_scripts: RepoOverviewScript[];
  dependency_manifests: RepoOverviewDependencyManifest[];
  runbook_commands: RepoOverviewRunCommand[];
  dependencies: RepoOverviewDependency[];
  workspaces: RepoOverviewWorkspace[];
  stack_components: RepoOverviewStackComponent[];
  service_integrations: RepoOverviewServiceIntegration[];
  graphql_surfaces: RepoOverviewGraphQLSurface[];
  message_buses: RepoOverviewMessageBus[];
  data_stores: RepoOverviewDataStore[];
  ai_surfaces: RepoOverviewAISurface[];
  payment_surfaces: RepoOverviewPaymentSurface[];
  auth_surfaces: RepoOverviewAuthSurface[];
  background_jobs: RepoOverviewBackgroundJob[];
  webhook_surfaces: RepoOverviewWebhookSurface[];
  observability_surfaces: RepoOverviewObservabilitySurface[];
  feature_flags: RepoOverviewFeatureFlag[];
  notification_surfaces: RepoOverviewNotificationSurface[];
  environment_variables: RepoOverviewEnvVar[];
  ci_workflows: RepoOverviewCIWorkflow[];
  container_services: RepoOverviewContainerService[];
  runtime_requirements: RepoOverviewRuntimeRequirement[];
  api_contracts: RepoOverviewApiContract[];
  cli_commands: RepoOverviewCliCommand[];
  test_systems: RepoOverviewTestSystem[];
  release_processes: RepoOverviewReleaseProcess[];
  quality_tools: RepoOverviewQualityTool[];
  dev_environments: RepoOverviewDevEnvironment[];
  build_systems: RepoOverviewBuildSystem[];
  ui_surfaces: RepoOverviewUiSurface[];
  mobile_surfaces: RepoOverviewMobileSurface[];
  infra_resources: RepoOverviewInfraResource[];
  repo_policies: RepoOverviewPolicy[];
  code_owners: RepoOverviewCodeOwner[];
  deploy_targets: RepoOverviewDeployTarget[];
  supply_chain: RepoOverviewSupplyChain[];
  secret_signals: RepoOverviewSecretSignal[];
  index_fallbacks: RepoOverviewIndexFallback[];
  route_endpoints: RepoOverviewRoute[];
  import_relationships: RepoOverviewImport[];
  migration_facts: RepoOverviewMigrationFact[];
  search_quality_cases: Record<string, unknown>[];
  search_quality_baseline?: RepoSearchQualityBaseline | null;
  symbol_types: Record<string, number>;
  top_symbols: RepoOverviewSymbol[];
  warnings: string[];
}

export interface RepoFact {
  id: number;
  kind: string;
  key: string;
  value: string;
  source_path?: string;
  source_line?: number;
  confidence: string;
  metadata: Record<string, unknown>;
}

export interface RepoFactsResponse {
  repo_id: number;
  total: number;
  facts: RepoFact[];
}

export interface RepoRelationship {
  id: number;
  src_kind: string;
  src_id: number;
  source_path?: string | null;
  dst_kind: string;
  dst_id?: number | null;
  rel_type: string;
  target: string;
  confidence: string;
  source_line?: number | null;
  metadata: Record<string, unknown>;
}

export interface RepoRelationshipsResponse {
  repo_id: number;
  total: number;
  relationships: RepoRelationship[];
}

export interface RepoTeachingCitation {
  source_path: string;
  source_line?: number | null;
  label: string;
  kind: string;
}

export interface RepoTeachingStep {
  id: string;
  title: string;
  summary: string;
  citations: RepoTeachingCitation[];
}

export interface RepoTeachingResponse {
  repo_id: number;
  generated_from: string;
  steps: RepoTeachingStep[];
  warnings: string[];
}

export interface RepoTeachingQueryEvidence {
  kind: string;
  title: string;
  summary: string;
  score: number;
  citations: RepoTeachingCitation[];
}

export interface RepoTeachingQueryResponse {
  repo_id: number;
  question: string;
  generated_from: string;
  answer: string;
  evidence: RepoTeachingQueryEvidence[];
  warnings: string[];
}

export interface RepoSearchQualityExpected {
  symbol?: string | null;
  path?: string | null;
  type?: string | null;
}

export interface RepoSearchQualityTopResult {
  rank: number;
  symbol: string;
  path: string;
  type: string;
  score: number;
  match_info?: string | null;
}

export interface RepoSearchQualityResult {
  query: string;
  top_k: number;
  passed: boolean;
  rank?: number | null;
  elapsed_ms: number;
  expected: RepoSearchQualityExpected;
  top_results: RepoSearchQualityTopResult[];
  source: string;
}

export interface RepoSearchQualityGeneratedCase {
  query: string;
  expected_symbol?: string | null;
  expected_path?: string | null;
  expected_type?: string | null;
  top_k: number;
  source: string;
}

export interface RepoSearchQualityBaseline {
  min_recall_at_k?: number | null;
  min_mrr?: number | null;
  min_passed?: number | null;
  recall_delta?: number | null;
  mrr_delta?: number | null;
  passed_delta?: number | null;
  met: boolean;
}

export interface RepoSearchQualityResponse {
  repo_id: number;
  total: number;
  passed: number;
  failed: number;
  recall_at_k: number;
  mrr: number;
  generated_cases: RepoSearchQualityGeneratedCase[];
  results: RepoSearchQualityResult[];
  warnings: string[];
  baseline?: RepoSearchQualityBaseline | null;
}

export interface RepoStorageProfileSample {
  path: string;
  compression: string;
  compressed_bytes: number;
  uncompressed_bytes: number;
  compression_ratio: number;
  decompress_ms: number;
}

export interface RepoStorageProfileResponse {
  repo_id: number;
  total_bytes: number;
  artifact_bytes: Record<string, number>;
  file_count: number;
  blob_count: number;
  blob_coverage: number;
  blob_compressed_bytes: number;
  blob_uncompressed_bytes: number;
  blob_compression_ratio: number;
  sampled_blob_count: number;
  sampled_decompress_ms_total: number;
  sampled_decompress_ms_max: number;
  sampled_blobs: RepoStorageProfileSample[];
  warnings: string[];
}

export interface RepoModuleFile {
  id: number;
  path: string;
  total_lines: number;
  indexed_at: string;
  symbol_count: number;
  language: string;
}

export interface RepoModuleSymbol {
  id: number;
  name: string;
  symbol_type: string;
  file_path: string;
  start_line: number;
  end_line: number;
  docstring?: string | null;
}

export interface RepoModuleRelationship {
  id: number;
  rel_type: string;
  source_path?: string | null;
  source_symbol?: string | null;
  target: string;
  target_path?: string | null;
  target_symbol?: string | null;
  confidence: string;
  source_line?: number | null;
  metadata: Record<string, unknown>;
}

export interface RepoModuleDetailResponse {
  repo_id: number;
  module_path: string;
  file_count: number;
  line_count: number;
  symbol_count: number;
  languages: string[];
  files: RepoModuleFile[];
  symbols: RepoModuleSymbol[];
  imports: RepoModuleRelationship[];
  exports: RepoModuleRelationship[];
  outgoing: RepoModuleRelationship[];
  incoming: RepoModuleRelationship[];
  warnings: string[];
}

class APIClient {
  private client: AxiosInstance;

  constructor(baseURL: string = '') {
    this.client = axios.create({
      baseURL,
      headers: {
        'Content-Type': 'application/json',
      },
      timeout: 30000, // 30 seconds
    });
  }

  /**
   * Health check
   */
  async health(): Promise<HealthResponse> {
    const response = await this.client.get<HealthResponse>('/api/codesniff/health');
    return response.data;
  }

  /**
   * Get index statistics
   */
  async getStats(): Promise<StatsResponse> {
    const response = await this.client.get<StatsResponse>('/api/codesniff/stats');
    return response.data;
  }

  /**
   * Search for code using natural language
   */
  async search(request: SearchRequest): Promise<SearchResponse> {
    const response = await this.client.post<SearchResponse>('/api/codesniff/search', {
      query: request.query,
      limit: request.limit || 20,
      min_similarity: request.min_similarity || 0.0,
      symbol_type: request.symbol_type,
      language_filter: request.language_filter,
    });
    return response.data;
  }

  /**
   * Search by symbol name
   */
  async searchByName(name: string, limit: number = 100): Promise<SearchResponse> {
    const response = await this.client.post<SearchResponse>(
      `/api/codesniff/search/name?name=${encodeURIComponent(name)}&limit=${limit}`
    );
    return response.data;
  }

  /**
   * Find similar code
   */
  async findSimilar(codeSnippet: string, limit: number = 10, minSimilarity: number = 0.5): Promise<SearchResponse> {
    const response = await this.client.post<SearchResponse>('/api/codesniff/search/similar', {
      code_snippet: codeSnippet,
      limit,
      min_similarity: minSimilarity,
    });
    return response.data;
  }

  /**
   * Get specific symbol
   */
  async getSymbol(name: string, filePath?: string): Promise<SearchResult> {
    const url = `/api/codesniff/symbol/${encodeURIComponent(name)}${filePath ? `?file_path=${encodeURIComponent(filePath)}` : ''}`;
    const response = await this.client.get<SearchResult>(url);
    return response.data;
  }

  /**
   * Index a directory
   */
  async indexDirectory(request: IndexRequest): Promise<IndexResponse> {
    const response = await this.client.post<IndexResponse>('/api/codesniff/index', {
      directory_path: request.directory_path,
      show_progress: request.show_progress !== false,
      semantic: request.semantic !== false,
    });
    return response.data;
  }

  async listRepos(): Promise<RepoResponse[]> {
    const response = await this.client.get<RepoResponse[]>('/api/codesniff/repos');
    return response.data;
  }

  async queueGithubRepo(repoUrl: string, name?: string): Promise<RepoIndexResponse> {
    const response = await this.client.post<RepoIndexResponse>('/api/codesniff/repos/github', {
      repo_url: repoUrl,
      name,
    });
    return response.data;
  }

  async queueUploadedRepo(files: FileList, isZip: boolean = false, name?: string): Promise<RepoIndexResponse> {
    const formData = new FormData();

    Array.from(files).forEach((file) => {
      formData.append('files', file, file.webkitRelativePath || file.name);
    });

    formData.append('is_zip', String(isZip));
    if (name) {
      formData.append('name', name);
    }

    const response = await this.client.post<RepoIndexResponse>('/api/codesniff/repos/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      timeout: 300000,
    });
    return response.data;
  }

  async getJob(jobId: number): Promise<JobResponse> {
    const response = await this.client.get<JobResponse>(`/api/codesniff/jobs/${jobId}`);
    return response.data;
  }

  async cancelJob(jobId: number): Promise<JobResponse> {
    const response = await this.client.post<JobResponse>(`/api/codesniff/jobs/${jobId}/cancel`);
    return response.data;
  }

  async searchRepo(repoId: number, request: SearchRequest): Promise<SearchResponse> {
    const response = await this.client.post<SearchResponse>(`/api/codesniff/repos/${repoId}/search`, {
      query: request.query,
      limit: request.limit || 20,
      min_similarity: request.min_similarity || 0.0,
      symbol_type: request.symbol_type,
      language_filter: request.language_filter,
    });
    return response.data;
  }

  async getRepoOverview(repoId: number): Promise<RepoOverviewResponse> {
    const response = await this.client.get<RepoOverviewResponse>(`/api/codesniff/repos/${repoId}/overview`);
    return response.data;
  }

  async getRepoFiles(repoId: number): Promise<RepoFilesResponse> {
    const response = await this.client.get<RepoFilesResponse>(`/api/codesniff/repos/${repoId}/files`);
    return response.data;
  }

  async getRepoFile(repoId: number, path: string): Promise<RepoFileContentResponse> {
    const params = new URLSearchParams({ path });
    const response = await this.client.get<RepoFileContentResponse>(`/api/codesniff/repos/${repoId}/file?${params.toString()}`);
    return response.data;
  }

  async getRepoFacts(repoId: number, kind?: string, limit: number = 80): Promise<RepoFactsResponse> {
    const params = new URLSearchParams({ limit: String(limit) });
    if (kind) {
      params.set('kind', kind);
    }
    const response = await this.client.get<RepoFactsResponse>(`/api/codesniff/repos/${repoId}/facts?${params.toString()}`);
    return response.data;
  }

  async getRepoRelationships(repoId: number, relType?: string, limit: number = 80): Promise<RepoRelationshipsResponse> {
    const params = new URLSearchParams({ limit: String(limit) });
    if (relType) {
      params.set('rel_type', relType);
    }
    const response = await this.client.get<RepoRelationshipsResponse>(`/api/codesniff/repos/${repoId}/relationships?${params.toString()}`);
    return response.data;
  }

  async getRepoTeaching(repoId: number): Promise<RepoTeachingResponse> {
    const response = await this.client.get<RepoTeachingResponse>(`/api/codesniff/repos/${repoId}/teaching`);
    return response.data;
  }

  async getRepoTeachingQuery(repoId: number, question: string, limit: number = 6): Promise<RepoTeachingQueryResponse> {
    const params = new URLSearchParams({ question, limit: String(limit) });
    const response = await this.client.get<RepoTeachingQueryResponse>(`/api/codesniff/repos/${repoId}/teaching/query?${params.toString()}`);
    return response.data;
  }

  async getRepoSearchQuality(repoId: number, maxCases: number = 8, topK: number = 5): Promise<RepoSearchQualityResponse> {
    const params = new URLSearchParams({ max_cases: String(maxCases), top_k: String(topK) });
    const response = await this.client.get<RepoSearchQualityResponse>(`/api/codesniff/repos/${repoId}/search-quality?${params.toString()}`);
    return response.data;
  }

  async getRepoStorageProfile(repoId: number, sampleBlobs: number = 5): Promise<RepoStorageProfileResponse> {
    const params = new URLSearchParams({ sample_blobs: String(sampleBlobs) });
    const response = await this.client.get<RepoStorageProfileResponse>(`/api/codesniff/repos/${repoId}/storage-profile?${params.toString()}`);
    return response.data;
  }

  async getRepoModuleDetail(repoId: number, modulePath: string): Promise<RepoModuleDetailResponse> {
    const encodedPath = modulePath.split('/').map((part) => encodeURIComponent(part)).join('/');
    const response = await this.client.get<RepoModuleDetailResponse>(`/api/codesniff/repos/${repoId}/modules/${encodedPath}`);
    return response.data;
  }

  async warmRepoSemantic(repoId: number): Promise<RepoIndexResponse> {
    const response = await this.client.post<RepoIndexResponse>(`/api/codesniff/repos/${repoId}/semantic/warm`);
    return response.data;
  }

  async enrichRepo(repoId: number): Promise<RepoIndexResponse> {
    const response = await this.client.post<RepoIndexResponse>(`/api/codesniff/repos/${repoId}/enrich`);
    return response.data;
  }

  async repairRepoSemantic(repoId: number): Promise<RepoResponse> {
    const response = await this.client.post<RepoResponse>(`/api/codesniff/repos/${repoId}/semantic/repair`);
    return response.data;
  }

  async refreshRepo(repoId: number): Promise<RepoIndexResponse> {
    const response = await this.client.post<RepoIndexResponse>(`/api/codesniff/repos/${repoId}/refresh`);
    return response.data;
  }

  async setRepoRefreshSchedule(repoId: number, intervalMinutes: number | null): Promise<RepoResponse> {
    const response = await this.client.post<RepoResponse>(`/api/codesniff/repos/${repoId}/refresh/schedule`, {
      interval_minutes: intervalMinutes,
    });
    return response.data;
  }

  async deleteRepo(repoId: number): Promise<{ success: boolean; repo_id: number; message: string }> {
    const response = await this.client.delete<{ success: boolean; repo_id: number; message: string }>(`/api/codesniff/repos/${repoId}`);
    return response.data;
  }

  /**
   * Clear the index
   */
  async clearIndex(): Promise<{ success: boolean; message: string }> {
    const response = await this.client.post('/api/codesniff/index/clear');
    return response.data;
  }

  /**
   * Get list of indexed files
   */
  async getFiles(): Promise<{ total_files: number; files: IndexedFile[] }> {
    const response = await this.client.get('/api/codesniff/files');
    return response.data;
  }

  /**
   * Chat with AI assistant about the codebase
   */
  async chat(request: ChatRequest): Promise<ChatResponse> {
    const params = new URLSearchParams();
    params.append('message', request.message);
    params.append('use_rag', String(request.use_rag !== false));

    const response = await this.client.post<ChatResponse>(
      `/api/codesniff/chat?${params.toString()}`,
      request.conversation_history || []
    );
    return response.data;
  }

  /**
   * Index a GitHub repository
   */
  async indexGithubRepo(repoUrl: string): Promise<IndexResponse> {
    const params = new URLSearchParams();
    params.append('repo_url', repoUrl);

    const response = await this.client.post<IndexResponse>(
      `/api/codesniff/index/github?${params.toString()}`,
      {},
      {
        timeout: 900000, // 15 minutes for large repos
      }
    );
    return response.data;
  }

  /**
   * Upload and index files (folder or zip)
   */
  async uploadAndIndex(files: FileList, isZip: boolean = false): Promise<IndexResponse> {
    const formData = new FormData();

    // Add all files to form data
    Array.from(files).forEach((file) => {
      formData.append('files', file, file.webkitRelativePath || file.name);
    });

    formData.append('is_zip', String(isZip));

    const response = await this.client.post<IndexResponse>('/api/codesniff/index/upload', formData, {
      headers: {
        'Content-Type': 'multipart/form-data',
      },
      timeout: 300000, // 5 minutes for large uploads
    });
    return response.data;
  }
}

export interface IndexedFile {
  id: number;
  path: string;
  total_lines: number;
  indexed_at: string;
  symbol_count: number;
}

export interface RepoFilesResponse {
  repo_id: number;
  total_files: number;
  files: IndexedFile[];
}

export interface RepoFileSymbol {
  id: number;
  name: string;
  symbol_type: string;
  start_line: number;
  end_line: number;
  docstring?: string | null;
}

export interface RepoFileContentResponse {
  repo_id: number;
  file: IndexedFile;
  content: string;
  size_bytes: number;
  symbols: RepoFileSymbol[];
}

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ChatSource {
  file: string;
  line: number;
  symbol: string;
  similarity: number;
}

export interface ChatRequest {
  message: string;
  conversation_history?: ChatMessage[];
  use_rag?: boolean;
}

export interface ChatResponse {
  answer: string;
  sources?: ChatSource[];
  used_rag: boolean;
  response_time_ms: number;
}

// Export singleton instance
// Use relative path for API calls - will be proxied by Flask to CodeSniff backend
export const apiClient = new APIClient(
  import.meta.env.VITE_API_URL || ''
);

export default apiClient;
