"""Pydantic models for API requests and responses"""

from typing import List, Optional, Dict, Any
from pydantic import BaseModel, Field


# Request Models

class IndexRequest(BaseModel):
    """Request to index a directory"""
    directory_path: str = Field(..., description="Path to directory containing Python files")
    show_progress: bool = Field(True, description="Show progress during indexing")
    semantic: bool = Field(True, description="Generate CodeBERT semantic vectors during indexing")

    class Config:
        json_schema_extra = {
            "example": {
                "directory_path": "/path/to/codebase",
                "show_progress": True
            }
        }


class GitHubRepoRequest(BaseModel):
    """Request to create and fast-index a GitHub repo"""
    repo_url: str = Field(..., description="GitHub repository URL")
    name: Optional[str] = Field(None, description="Optional display name")


class RepoRefreshScheduleRequest(BaseModel):
    """Request to enable or disable periodic lexical refresh"""
    interval_minutes: Optional[int] = Field(
        None,
        description="Refresh interval in minutes; null or 0 disables scheduled refresh",
        ge=0,
        le=43200,
    )


class SourceRetentionPolicyResponse(BaseModel):
    """Runtime source checkout retention policy."""
    mode: str
    enabled: bool
    prune_threshold_bytes: int
    cleanup_policy: str
    applies_to_source_types: List[str] = Field(default_factory=list)
    applies_to_index_modes: List[str] = Field(default_factory=list)
    managed_source_only: bool = True
    rehydrate_on: List[str] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)


class OperatorPolicyResponse(BaseModel):
    """Read-only operator policy currently active in this process."""
    source_retention: SourceRetentionPolicyResponse


class SearchRequest(BaseModel):
    """Request to search code"""
    query: str = Field(..., description="Natural language search query", min_length=1)
    limit: int = Field(20, description="Maximum number of results", ge=1, le=100)
    min_similarity: float = Field(0.0, description="Minimum similarity score", ge=0.0, le=1.0)
    symbol_type: Optional[str] = Field(None, description="Filter by symbol type: function, class, or method")
    file_path_filter: Optional[str] = Field(None, description="Filter by file path substring (e.g., 'backend', 'frontend')")
    language_filter: Optional[List[str]] = Field(None, description="Filter by programming languages (e.g., ['python', 'javascript'])")

    class Config:
        json_schema_extra = {
            "example": {
                "query": "authentication functions",
                "limit": 20,
                "min_similarity": 0.0,
                "symbol_type": None,
                "file_path_filter": None,
                "language_filter": None
            }
        }


class SimilarCodeRequest(BaseModel):
    """Request to find similar code"""
    code_snippet: str = Field(..., description="Code snippet to find similar matches for", min_length=1)
    limit: int = Field(10, description="Maximum number of results", ge=1, le=50)
    min_similarity: float = Field(0.5, description="Minimum similarity score", ge=0.0, le=1.0)

    class Config:
        json_schema_extra = {
            "example": {
                "code_snippet": "def authenticate(user, pwd):\n    return verify(user, pwd)",
                "limit": 10,
                "min_similarity": 0.5
            }
        }


class SymbolLookupRequest(BaseModel):
    """Request to lookup a specific symbol"""
    name: str = Field(..., description="Exact symbol name")
    file_path: Optional[str] = Field(None, description="Optional file path to narrow search")

    class Config:
        json_schema_extra = {
            "example": {
                "name": "authenticate_user",
                "file_path": "/path/to/auth.py"
            }
        }


# Response Models

class SearchResult(BaseModel):
    """Single search result"""
    symbol_name: str = Field(..., description="Name of the code symbol")
    symbol_type: str = Field(..., description="Type of symbol (function, class, method)")
    file_path: str = Field(..., description="Path to the file containing this symbol")
    code_snippet: str = Field(..., description="The actual code")
    start_line: int = Field(..., description="Starting line number", ge=1)
    end_line: int = Field(..., description="Ending line number", ge=1)
    similarity_score: float = Field(..., description="Similarity score (0-1)", ge=0.0, le=1.0)
    docstring: Optional[str] = Field(None, description="Function/class docstring if available")
    match_info: Optional[str] = Field(None, description="Explanation of why this result matched")
    highlighted_name: Optional[str] = Field(None, description="Symbol name with matched terms highlighted")
    highlighted_docstring: Optional[str] = Field(None, description="Docstring with matched terms highlighted")

    class Config:
        json_schema_extra = {
            "example": {
                "symbol_name": "authenticate_user",
                "symbol_type": "function",
                "file_path": "/path/to/auth.py",
                "code_snippet": "def authenticate_user(username, password):\n    return check_creds(username, password)",
                "start_line": 10,
                "end_line": 12,
                "similarity_score": 0.92,
                "docstring": "Authenticate a user with credentials",
                "match_info": "Keywords: auth, user"
            }
        }


class SearchResponse(BaseModel):
    """Response for search requests"""
    query: str = Field(..., description="The search query")
    results: List[SearchResult] = Field(..., description="List of search results")
    total_results: int = Field(..., description="Total number of results returned")
    search_time_ms: float = Field(..., description="Time taken for search in milliseconds")

    class Config:
        json_schema_extra = {
            "example": {
                "query": "authentication functions",
                "results": [],
                "total_results": 5,
                "search_time_ms": 150.5
            }
        }


class IndexStats(BaseModel):
    """Statistics from indexing operation"""
    files_processed: int = Field(..., description="Number of files successfully processed")
    files_failed: int = Field(..., description="Number of files that failed to process")
    total_symbols: int = Field(..., description="Total symbols indexed")
    functions_indexed: int = Field(..., description="Number of functions indexed")
    classes_indexed: int = Field(..., description="Number of classes indexed")
    methods_indexed: int = Field(..., description="Number of methods indexed")
    total_lines: int = Field(..., description="Total lines of code processed")
    time_taken: float = Field(..., description="Time taken in seconds")

    class Config:
        json_schema_extra = {
            "example": {
                "files_processed": 25,
                "files_failed": 0,
                "total_symbols": 150,
                "functions_indexed": 80,
                "classes_indexed": 20,
                "methods_indexed": 50,
                "total_lines": 5000,
                "time_taken": 15.3
            }
        }


class IndexResponse(BaseModel):
    """Response for index requests"""
    success: bool = Field(..., description="Whether indexing succeeded")
    stats: IndexStats = Field(..., description="Indexing statistics")
    message: str = Field(..., description="Status message")

    class Config:
        json_schema_extra = {
            "example": {
                "success": True,
                "stats": {
                    "files_processed": 25,
                    "files_failed": 0,
                    "total_symbols": 150,
                    "functions_indexed": 80,
                    "classes_indexed": 20,
                    "methods_indexed": 50,
                    "total_lines": 5000,
                    "time_taken": 15.3
                },
                "message": "Successfully indexed 25 files"
            }
        }


class RepoResponse(BaseModel):
    """Repository registered for cold artifact indexing"""
    id: int
    name: str
    source_type: str
    source_url: Optional[str] = None
    status: str
    active_revision: Optional[str] = None
    storage_path: str
    created_at: str
    updated_at: str
    last_opened_at: Optional[str] = None
    error_summary: Optional[str] = None
    storage_bytes: int = 0
    total_symbols: int = 0
    total_files: int = 0
    lexical_ready: bool = False
    lexical_index_mode: str = "unknown"
    semantic_ready: bool = False
    artifact_health: str = "missing"
    artifact_warnings: List[str] = Field(default_factory=list)
    source_available: bool = False
    source_pruned: bool = False
    source_retention_policy: str = "unknown"
    refresh_interval_minutes: Optional[int] = None
    next_refresh_at: Optional[str] = None
    last_scheduled_refresh_at: Optional[str] = None


class JobResponse(BaseModel):
    """Indexing job status"""
    id: int
    repo_id: int
    kind: str
    status: str
    phase: str
    files_seen: int = 0
    files_indexed: int = 0
    symbols_indexed: int = 0
    started_at: Optional[str] = None
    finished_at: Optional[str] = None
    error: Optional[str] = None
    cancel_requested: bool = False


class RepoIndexResponse(BaseModel):
    """Response after queueing repo indexing"""
    repo: RepoResponse
    job: JobResponse
    message: str


class RepoFileSummary(BaseModel):
    """Indexed file row for a repo-scoped file browser"""
    id: int
    path: str
    total_lines: int = 0
    indexed_at: str
    symbol_count: int = 0


class RepoFilesResponse(BaseModel):
    """Repo-scoped indexed file list"""
    repo_id: int
    total_files: int
    files: List[RepoFileSummary] = Field(default_factory=list)


class RepoFileSymbol(BaseModel):
    """Symbol outline row for one file"""
    id: int
    name: str
    symbol_type: str
    start_line: int
    end_line: int
    docstring: Optional[str] = None


class RepoFileContentResponse(BaseModel):
    """Source text and outline for one indexed repo file"""
    repo_id: int
    file: RepoFileSummary
    content: str
    size_bytes: int = 0
    symbols: List[RepoFileSymbol] = Field(default_factory=list)


class RepoOverviewLanguage(BaseModel):
    """Language summary for a repo overview"""
    language: str
    file_count: int
    line_count: int
    support_level: str = "searchable"
    symbol_aware: bool = False
    searchable: bool = True


class RepoOverviewDirectory(BaseModel):
    """Top-level directory summary for a repo overview"""
    path: str
    file_count: int
    line_count: int


class RepoOverviewModule(BaseModel):
    """Derived repo module/package summary from indexed files"""
    path: str
    file_count: int
    line_count: int
    symbol_count: int = 0
    languages: List[str] = Field(default_factory=list)
    sample_files: List[str] = Field(default_factory=list)


class RepoOverviewModuleDependency(BaseModel):
    """Resolved dependency edge between two derived modules"""
    source_module: str
    target_module: str
    source_path: str
    target_path: str
    source_line: int = 0
    import_count: int = 0
    sample_imports: List[Dict[str, Any]] = Field(default_factory=list)


class RepoOverviewFileFact(BaseModel):
    """Interesting file discovered during overview extraction"""
    path: str
    kind: str
    detail: str
    total_lines: int = 0


class RepoOverviewIndexFallback(BaseModel):
    """File indexed with bounded fallback instead of full parsing"""
    path: str
    reason: str
    total_lines: int = 0


class RepoOverviewScript(BaseModel):
    """Package script discovered from a package manifest"""
    name: str
    command: str
    source_path: str


class RepoOverviewRoute(BaseModel):
    """Route endpoint discovered from source files"""
    method: str
    path: str
    source_path: str
    line: int
    framework: str


class RepoOverviewImport(BaseModel):
    """File-level import relationship discovered during indexing"""
    source_path: str
    target: str
    target_path: Optional[str] = None
    source_line: int = 0
    confidence: str
    syntax: str = ""


class RepoOverviewDependencyManifest(BaseModel):
    """Dependency manifest discovered from a repo overview"""
    ecosystem: str
    package_manager: str
    source_path: str
    dependency_count: int
    dev_dependency_count: int = 0
    detail: str = ""


class RepoOverviewRunCommand(BaseModel):
    """Install, run, test, build, or task command inferred from repo manifests"""
    category: str
    name: str
    command: str
    source_path: str
    detail: str = ""


class RepoOverviewDependency(BaseModel):
    """Representative dependency discovered from repo manifests"""
    name: str
    ecosystem: str
    scope: str
    source_path: str


class RepoOverviewWorkspace(BaseModel):
    """Workspace package, project, crate, or module declared by a repo manifest"""
    name: str
    path: str
    workspace_kind: str
    ecosystem: str = ""
    manager: str = ""
    source_path: str
    line: int = 0
    detail: str = ""


class RepoOverviewStackComponent(BaseModel):
    """Probable stack component inferred from manifests and dependency names"""
    name: str
    category: str
    ecosystem: str = ""
    source_path: str
    line: int
    source: str = ""
    detail: str = ""


class RepoOverviewServiceIntegration(BaseModel):
    """External service or infrastructure integration inferred without storing secrets"""
    name: str
    category: str
    source_path: str
    line: int
    source: str = ""
    detail: str = ""


class RepoOverviewGraphQLSurface(BaseModel):
    """GraphQL schema, server, client, resolver, or operation inferred from cold repo evidence"""
    name: str
    category: str
    source_path: str
    line: int
    source: str = ""
    detail: str = ""


class RepoOverviewMessageBus(BaseModel):
    """Event broker, queue, pub/sub, producer, or consumer inferred from cold repo evidence"""
    name: str
    category: str
    source_path: str
    line: int
    source: str = ""
    detail: str = ""


class RepoOverviewDataStore(BaseModel):
    """Database, cache, object store, or search store inferred from cold repo evidence"""
    name: str
    category: str
    source_path: str
    line: int
    source: str = ""
    detail: str = ""


class RepoOverviewAISurface(BaseModel):
    """LLM, prompt, embedding, RAG, or agent surface inferred from cold repo evidence"""
    name: str
    category: str
    source_path: str
    line: int
    source: str = ""
    detail: str = ""


class RepoOverviewPaymentSurface(BaseModel):
    """Checkout, payment, subscription, or billing surface inferred from cold repo evidence"""
    name: str
    category: str
    source_path: str
    line: int
    source: str = ""
    detail: str = ""


class RepoOverviewAuthSurface(BaseModel):
    """Authentication or authorization surface inferred from cold repo evidence"""
    name: str
    category: str
    source_path: str
    line: int
    source: str = ""
    detail: str = ""


class RepoOverviewBackgroundJob(BaseModel):
    """Background job, queue, worker, or schedule surface inferred from cold repo evidence"""
    name: str
    category: str
    source_path: str
    line: int
    source: str = ""
    detail: str = ""


class RepoOverviewWebhookSurface(BaseModel):
    """Webhook or callback surface inferred from cold repo evidence"""
    name: str
    category: str
    source_path: str
    line: int
    source: str = ""
    detail: str = ""


class RepoOverviewObservabilitySurface(BaseModel):
    """Logging, metrics, tracing, health, or error-monitoring surface inferred from cold repo evidence"""
    name: str
    category: str
    source_path: str
    line: int
    source: str = ""
    detail: str = ""


class RepoOverviewFeatureFlag(BaseModel):
    """Feature flag, toggle, or experiment signal inferred from cold repo evidence"""
    name: str
    category: str
    source_path: str
    line: int
    source: str = ""
    detail: str = ""


class RepoOverviewNotificationSurface(BaseModel):
    """Outbound email, SMS, push, chat, or notification sender inferred from cold repo evidence"""
    name: str
    category: str
    source_path: str
    line: int
    source: str = ""
    detail: str = ""


class RepoOverviewEnvVar(BaseModel):
    """Environment variable declared by a repo template or compose file"""
    name: str
    detail: str
    source_path: str
    line: int
    source: str = ""
    service: str = ""
    required: bool = False
    has_default: bool = False


class RepoOverviewCIWorkflow(BaseModel):
    """CI workflow discovered from repository automation files"""
    name: str
    detail: str
    source_path: str
    line: int
    provider: str = ""
    events: List[str] = Field(default_factory=list)
    jobs: List[str] = Field(default_factory=list)
    commands: List[str] = Field(default_factory=list)


class RepoOverviewContainerService(BaseModel):
    """Container service discovered from Compose files"""
    name: str
    detail: str
    source_path: str
    line: int
    provider: str = ""
    image: str = ""
    build: str = ""
    command: str = ""
    ports: List[str] = Field(default_factory=list)
    depends_on: List[str] = Field(default_factory=list)


class RepoOverviewRuntimeRequirement(BaseModel):
    """Runtime or toolchain version requirement discovered from repo manifests"""
    runtime: str
    requirement: str
    source_path: str
    line: int
    source: str = ""
    detail: str = ""


class RepoOverviewInfraResource(BaseModel):
    """Infrastructure-as-code resource, module, provider, or project signal"""
    provider: str = ""
    category: str
    resource_type: str
    name: str
    source_path: str
    line: int
    source: str = ""
    detail: str = ""


class RepoOverviewApiContract(BaseModel):
    """API contract, operation, channel, request, or protobuf service signal"""
    name: str
    category: str
    protocol: str = ""
    source_path: str
    line: int
    source: str = ""
    detail: str = ""


class RepoOverviewCliCommand(BaseModel):
    """CLI command entry point discovered from manifests or executable paths"""
    name: str
    category: str
    command: str
    source_path: str
    line: int
    source: str = ""
    detail: str = ""


class RepoOverviewTestSystem(BaseModel):
    """Test runner, framework, config, target, or task discovered from repo config"""
    name: str
    category: str
    tool: str = ""
    command: str = ""
    source_path: str
    line: int
    source: str = ""
    detail: str = ""


class RepoOverviewReleaseProcess(BaseModel):
    """Release, publish, versioning, changelog, or release automation signal"""
    name: str
    category: str
    tool: str = ""
    command: str = ""
    source_path: str
    line: int
    source: str = ""
    detail: str = ""


class RepoOverviewQualityTool(BaseModel):
    """Lint, format, typecheck, or static-analysis tool discovered from repo config"""
    name: str
    category: str
    tool: str = ""
    command: str = ""
    source_path: str
    line: int
    source: str = ""
    detail: str = ""


class RepoOverviewDevEnvironment(BaseModel):
    """Developer environment or local setup surface discovered from repo config"""
    name: str
    category: str
    tool: str = ""
    source_path: str
    line: int
    source: str = ""
    detail: str = ""


class RepoOverviewBuildSystem(BaseModel):
    """Build system project, module, target, task, or plugin discovered from build manifests"""
    name: str
    category: str
    tool: str = ""
    command: str
    source_path: str
    line: int
    source: str = ""
    detail: str = ""


class RepoOverviewUiSurface(BaseModel):
    """Frontend page, component, form, or story discovered from UI source files"""
    name: str
    category: str
    framework: str = ""
    source_path: str
    line: int
    source: str = ""
    detail: str = ""


class RepoOverviewMobileSurface(BaseModel):
    """Mobile app, platform component, entry point, or deep-link surface"""
    name: str
    category: str
    platform: str = ""
    source_path: str
    line: int
    source: str = ""
    detail: str = ""


class RepoOverviewPolicy(BaseModel):
    """Repository policy signal discovered from policy files or manifests"""
    policy_type: str
    name: str
    value: str
    source_path: str
    line: int
    source: str = ""
    detail: str = ""


class RepoOverviewCodeOwner(BaseModel):
    """CODEOWNERS rule discovered from repository ownership files"""
    pattern: str
    owners: List[str] = Field(default_factory=list)
    source_path: str
    line: int
    detail: str = ""


class RepoOverviewDeployTarget(BaseModel):
    """Deployment target discovered from deploy and hosting config files"""
    provider: str
    target_type: str
    name: str
    source_path: str
    line: int
    detail: str = ""


class RepoOverviewSupplyChain(BaseModel):
    """Supply-chain control or reproducibility signal discovered from repo config"""
    name: str
    category: str
    tool: str = ""
    ecosystem: str = ""
    source_path: str
    line: int
    source: str = ""
    detail: str = ""


class RepoOverviewSecretSignal(BaseModel):
    """Likely secret marker discovered without storing the secret value"""
    name: str
    category: str
    source_path: str
    line: int
    source: str = ""
    has_value: bool = False
    detail: str = ""


class RepoOverviewMigrationFact(BaseModel):
    """Schema migration operation discovered from common migration files"""
    action: str
    table: str
    field: str = ""
    detail: str
    source_path: str
    line: int = 0
    source: str = ""
    framework: str = ""
    operation: str = ""
    name: str = ""


class RepoOverviewSymbol(BaseModel):
    """Representative symbol for repo overview"""
    name: str
    symbol_type: str
    path: str
    start_line: int


class RepoOverviewDocSection(BaseModel):
    """Markdown documentation section discovered from cold source facts"""
    source_path: str
    line: int
    level: int
    title: str
    anchor: str = ""


class RepoOverviewArchitectureDecision(BaseModel):
    """Architecture decision record, RFC, or design document discovered from docs"""
    name: str
    category: str
    status: str = ""
    source_path: str
    line: int
    source: str = ""
    detail: str = ""


class RepoOverviewResponse(BaseModel):
    """Deterministic repo overview facts from cold artifacts"""
    repo_id: int
    total_files: int
    total_symbols: int
    languages: List[RepoOverviewLanguage] = Field(default_factory=list)
    top_directories: List[RepoOverviewDirectory] = Field(default_factory=list)
    modules: List[RepoOverviewModule] = Field(default_factory=list)
    module_dependencies: List[RepoOverviewModuleDependency] = Field(default_factory=list)
    docs: List[RepoOverviewFileFact] = Field(default_factory=list)
    doc_sections: List[RepoOverviewDocSection] = Field(default_factory=list)
    architecture_decisions: List[RepoOverviewArchitectureDecision] = Field(default_factory=list)
    configs: List[RepoOverviewFileFact] = Field(default_factory=list)
    tests: List[RepoOverviewFileFact] = Field(default_factory=list)
    entry_points: List[RepoOverviewFileFact] = Field(default_factory=list)
    package_scripts: List[RepoOverviewScript] = Field(default_factory=list)
    dependency_manifests: List[RepoOverviewDependencyManifest] = Field(default_factory=list)
    runbook_commands: List[RepoOverviewRunCommand] = Field(default_factory=list)
    dependencies: List[RepoOverviewDependency] = Field(default_factory=list)
    workspaces: List[RepoOverviewWorkspace] = Field(default_factory=list)
    stack_components: List[RepoOverviewStackComponent] = Field(default_factory=list)
    service_integrations: List[RepoOverviewServiceIntegration] = Field(default_factory=list)
    graphql_surfaces: List[RepoOverviewGraphQLSurface] = Field(default_factory=list)
    message_buses: List[RepoOverviewMessageBus] = Field(default_factory=list)
    data_stores: List[RepoOverviewDataStore] = Field(default_factory=list)
    ai_surfaces: List[RepoOverviewAISurface] = Field(default_factory=list)
    payment_surfaces: List[RepoOverviewPaymentSurface] = Field(default_factory=list)
    auth_surfaces: List[RepoOverviewAuthSurface] = Field(default_factory=list)
    background_jobs: List[RepoOverviewBackgroundJob] = Field(default_factory=list)
    webhook_surfaces: List[RepoOverviewWebhookSurface] = Field(default_factory=list)
    observability_surfaces: List[RepoOverviewObservabilitySurface] = Field(default_factory=list)
    feature_flags: List[RepoOverviewFeatureFlag] = Field(default_factory=list)
    notification_surfaces: List[RepoOverviewNotificationSurface] = Field(default_factory=list)
    environment_variables: List[RepoOverviewEnvVar] = Field(default_factory=list)
    ci_workflows: List[RepoOverviewCIWorkflow] = Field(default_factory=list)
    container_services: List[RepoOverviewContainerService] = Field(default_factory=list)
    runtime_requirements: List[RepoOverviewRuntimeRequirement] = Field(default_factory=list)
    api_contracts: List[RepoOverviewApiContract] = Field(default_factory=list)
    cli_commands: List[RepoOverviewCliCommand] = Field(default_factory=list)
    test_systems: List[RepoOverviewTestSystem] = Field(default_factory=list)
    release_processes: List[RepoOverviewReleaseProcess] = Field(default_factory=list)
    quality_tools: List[RepoOverviewQualityTool] = Field(default_factory=list)
    dev_environments: List[RepoOverviewDevEnvironment] = Field(default_factory=list)
    build_systems: List[RepoOverviewBuildSystem] = Field(default_factory=list)
    ui_surfaces: List[RepoOverviewUiSurface] = Field(default_factory=list)
    mobile_surfaces: List[RepoOverviewMobileSurface] = Field(default_factory=list)
    infra_resources: List[RepoOverviewInfraResource] = Field(default_factory=list)
    repo_policies: List[RepoOverviewPolicy] = Field(default_factory=list)
    code_owners: List[RepoOverviewCodeOwner] = Field(default_factory=list)
    deploy_targets: List[RepoOverviewDeployTarget] = Field(default_factory=list)
    supply_chain: List[RepoOverviewSupplyChain] = Field(default_factory=list)
    secret_signals: List[RepoOverviewSecretSignal] = Field(default_factory=list)
    index_fallbacks: List[RepoOverviewIndexFallback] = Field(default_factory=list)
    route_endpoints: List[RepoOverviewRoute] = Field(default_factory=list)
    import_relationships: List[RepoOverviewImport] = Field(default_factory=list)
    migration_facts: List[RepoOverviewMigrationFact] = Field(default_factory=list)
    search_quality_cases: List[Dict[str, Any]] = Field(default_factory=list)
    search_quality_baseline: Optional[Dict[str, Any]] = None
    symbol_types: Dict[str, int] = Field(default_factory=dict)
    top_symbols: List[RepoOverviewSymbol] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)


class RepoFactResponse(BaseModel):
    """Queryable repo-level fact persisted in the cold SQLite artifact"""
    id: int
    kind: str
    key: str
    value: str
    source_path: Optional[str] = None
    source_line: Optional[int] = None
    confidence: str = "derived"
    metadata: Dict[str, Any] = Field(default_factory=dict)


class RepoFactsResponse(BaseModel):
    """Response for normalized repo facts"""
    repo_id: int
    total: int
    facts: List[RepoFactResponse] = Field(default_factory=list)


class RepoRelationshipResponse(BaseModel):
    """Queryable relationship persisted in the cold SQLite artifact"""
    id: int
    src_kind: str
    src_id: int
    source_path: Optional[str] = None
    dst_kind: str
    dst_id: Optional[int] = None
    rel_type: str
    target: str
    confidence: str
    source_line: Optional[int] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


class RepoRelationshipsResponse(BaseModel):
    """Response for persisted repo relationships"""
    repo_id: int
    total: int
    relationships: List[RepoRelationshipResponse] = Field(default_factory=list)


class RepoTeachingCitationResponse(BaseModel):
    """Source evidence attached to a deterministic teaching step"""
    source_path: str
    source_line: Optional[int] = None
    label: str
    kind: str


class RepoTeachingStepResponse(BaseModel):
    """Cited walkthrough step derived from cold repo facts"""
    id: str
    title: str
    summary: str
    citations: List[RepoTeachingCitationResponse] = Field(default_factory=list)


class RepoTeachingResponse(BaseModel):
    """Deterministic repo teaching walkthrough from cold artifacts"""
    repo_id: int
    generated_from: str
    steps: List[RepoTeachingStepResponse] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)


class RepoTeachingQueryEvidenceResponse(BaseModel):
    """Question-specific cited evidence from cold artifacts"""
    kind: str
    title: str
    summary: str
    score: float
    citations: List[RepoTeachingCitationResponse] = Field(default_factory=list)


class RepoTeachingQueryResponse(BaseModel):
    """Deterministic answer evidence for a repo question"""
    repo_id: int
    question: str
    generated_from: str
    answer: str
    evidence: List[RepoTeachingQueryEvidenceResponse] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)


class RepoSearchQualityExpectedResponse(BaseModel):
    """Expected result for one generated search-quality case"""
    symbol: Optional[str] = None
    path: Optional[str] = None
    type: Optional[str] = None


class RepoSearchQualityTopResultResponse(BaseModel):
    """Top retrieved result for a search-quality case"""
    rank: int
    symbol: str
    path: str
    type: str
    score: float
    match_info: Optional[str] = None


class RepoSearchQualityResultResponse(BaseModel):
    """One generated smoke query and its retrieval result"""
    query: str
    top_k: int
    passed: bool
    rank: Optional[int] = None
    elapsed_ms: float
    expected: RepoSearchQualityExpectedResponse
    top_results: List[RepoSearchQualityTopResultResponse] = Field(default_factory=list)
    source: str = "generated"


class RepoSearchQualityGeneratedCaseResponse(BaseModel):
    """Generated search-quality smoke case before evaluation"""
    query: str
    expected_symbol: Optional[str] = None
    expected_path: Optional[str] = None
    expected_type: Optional[str] = None
    top_k: int
    source: str


class RepoSearchQualityBaselineResponse(BaseModel):
    """Repo-owned minimum search-quality thresholds and current deltas"""
    min_recall_at_k: Optional[float] = None
    min_mrr: Optional[float] = None
    min_passed: Optional[int] = None
    recall_delta: Optional[float] = None
    mrr_delta: Optional[float] = None
    passed_delta: Optional[int] = None
    met: bool


class RepoSearchQualityResponse(BaseModel):
    """Generated cold lexical search-quality smoke report"""
    repo_id: int
    total: int
    passed: int
    failed: int
    recall_at_k: float
    mrr: float
    generated_cases: List[RepoSearchQualityGeneratedCaseResponse] = Field(default_factory=list)
    results: List[RepoSearchQualityResultResponse] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)
    baseline: Optional[RepoSearchQualityBaselineResponse] = None


class RepoStorageProfileSampleResponse(BaseModel):
    """Sampled source blob storage and read metric"""
    path: str
    compression: str
    compressed_bytes: int
    uncompressed_bytes: int
    compression_ratio: float
    decompress_ms: float


class RepoStorageProfileResponse(BaseModel):
    """Cold artifact storage profile for one repo"""
    repo_id: int
    total_bytes: int
    artifact_bytes: Dict[str, int] = Field(default_factory=dict)
    file_count: int
    blob_count: int
    blob_coverage: float
    blob_compressed_bytes: int
    blob_uncompressed_bytes: int
    blob_compression_ratio: float
    sampled_blob_count: int
    sampled_decompress_ms_total: float
    sampled_decompress_ms_max: float
    sampled_blobs: List[RepoStorageProfileSampleResponse] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)


class RepoModuleFileResponse(BaseModel):
    """Indexed file that belongs to a derived module/package"""
    id: int
    path: str
    total_lines: int = 0
    indexed_at: str
    symbol_count: int = 0
    language: str


class RepoModuleSymbolResponse(BaseModel):
    """Symbol row that belongs to a derived module/package"""
    id: int
    name: str
    symbol_type: str
    file_path: str
    start_line: int
    end_line: int
    docstring: Optional[str] = None


class RepoModuleRelationshipResponse(BaseModel):
    """Relationship row projected into a module detail view"""
    id: int
    rel_type: str
    source_path: Optional[str] = None
    source_symbol: Optional[str] = None
    target: str
    target_path: Optional[str] = None
    target_symbol: Optional[str] = None
    confidence: str
    source_line: Optional[int] = None
    metadata: Dict[str, Any] = Field(default_factory=dict)


class RepoModuleDetailResponse(BaseModel):
    """Cold-artifact detail for one derived module/package"""
    repo_id: int
    module_path: str
    file_count: int
    line_count: int
    symbol_count: int
    languages: List[str] = Field(default_factory=list)
    files: List[RepoModuleFileResponse] = Field(default_factory=list)
    symbols: List[RepoModuleSymbolResponse] = Field(default_factory=list)
    imports: List[RepoModuleRelationshipResponse] = Field(default_factory=list)
    exports: List[RepoModuleRelationshipResponse] = Field(default_factory=list)
    outgoing: List[RepoModuleRelationshipResponse] = Field(default_factory=list)
    incoming: List[RepoModuleRelationshipResponse] = Field(default_factory=list)
    warnings: List[str] = Field(default_factory=list)


class StatsResponse(BaseModel):
    """Response for stats endpoint"""
    total_symbols: int = Field(..., description="Total symbols indexed")
    total_files: int = Field(..., description="Total files indexed")
    functions: int = Field(..., description="Number of functions")
    classes: int = Field(..., description="Number of classes")
    vector_count: int = Field(..., description="Number of vectors in store")
    ready: bool = Field(..., description="Whether the system is ready for searches")
    lexical_ready: bool = Field(False, description="Whether keyword/symbol search is available")
    semantic_ready: bool = Field(False, description="Whether semantic vector search is available")
    index_status: str = Field("empty", description="Index state: empty, lexical_ready, or semantic_ready")

    class Config:
        json_schema_extra = {
            "example": {
                "total_symbols": 150,
                "total_files": 25,
                "functions": 100,
                "classes": 50,
                "vector_count": 150,
                "ready": True
            }
        }


class HealthResponse(BaseModel):
    """Response for health check"""
    status: str = Field(..., description="Service status")
    version: str = Field(..., description="API version")
    ready: bool = Field(..., description="Whether the service is ready")

    class Config:
        json_schema_extra = {
            "example": {
                "status": "healthy",
                "version": "1.0.0",
                "ready": True
            }
        }


class ErrorResponse(BaseModel):
    """Error response"""
    error: str = Field(..., description="Error message")
    details: Optional[str] = Field(None, description="Additional error details")

    class Config:
        json_schema_extra = {
            "example": {
                "error": "Invalid request",
                "details": "Query parameter is required"
            }
        }
