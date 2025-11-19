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
}

export interface IndexRequest {
  directory_path: string;
  show_progress?: boolean;
}

class APIClient {
  private client: AxiosInstance;

  constructor(baseURL: string = 'http://localhost:8000') {
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
    const response = await this.client.get<HealthResponse>('/api/health');
    return response.data;
  }

  /**
   * Get index statistics
   */
  async getStats(): Promise<StatsResponse> {
    const response = await this.client.get<StatsResponse>('/api/stats');
    return response.data;
  }

  /**
   * Search for code using natural language
   */
  async search(request: SearchRequest): Promise<SearchResponse> {
    const response = await this.client.post<SearchResponse>('/api/search', {
      query: request.query,
      limit: request.limit || 20,
      min_similarity: request.min_similarity || 0.0,
      symbol_type: request.symbol_type,
    });
    return response.data;
  }

  /**
   * Search by symbol name
   */
  async searchByName(name: string, limit: number = 100): Promise<SearchResponse> {
    const response = await this.client.post<SearchResponse>(
      `/api/search/name?name=${encodeURIComponent(name)}&limit=${limit}`
    );
    return response.data;
  }

  /**
   * Find similar code
   */
  async findSimilar(codeSnippet: string, limit: number = 10, minSimilarity: number = 0.5): Promise<SearchResponse> {
    const response = await this.client.post<SearchResponse>('/api/search/similar', {
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
    const url = `/api/symbol/${encodeURIComponent(name)}${filePath ? `?file_path=${encodeURIComponent(filePath)}` : ''}`;
    const response = await this.client.get<SearchResult>(url);
    return response.data;
  }

  /**
   * Index a directory
   */
  async indexDirectory(request: IndexRequest): Promise<IndexResponse> {
    const response = await this.client.post<IndexResponse>('/api/index', {
      directory_path: request.directory_path,
      show_progress: request.show_progress !== false,
    });
    return response.data;
  }

  /**
   * Clear the index
   */
  async clearIndex(): Promise<{ success: boolean; message: string }> {
    const response = await this.client.post('/api/index/clear');
    return response.data;
  }

  /**
   * Get list of indexed files
   */
  async getFiles(): Promise<{ total_files: number; files: IndexedFile[] }> {
    const response = await this.client.get('/api/files');
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
      `/api/chat?${params.toString()}`,
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
      `/api/index/github?${params.toString()}`,
      {},
      {
        timeout: 300000, // 5 minutes
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

    const response = await this.client.post<IndexResponse>('/api/index/upload', formData, {
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
export const apiClient = new APIClient(
  import.meta.env.VITE_API_URL || 'http://localhost:8000'
);

export default apiClient;
