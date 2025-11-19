"""Indexer orchestrates parsing, embedding, and storage of code"""

import time
from pathlib import Path
from typing import List, Dict, Any, Optional
from dataclasses import dataclass
from loguru import logger
from tqdm import tqdm
import numpy as np

from .parser import CodeParser, ParsedFile, ParsedFunction, ParsedClass
from .js_parser import JSParser, ParsedJSFile, ParsedJSFunction, ParsedJSClass
from .embedder import CodeEmbedder
from .text_search import TextSearchEngine
from ..storage.vector_store import VectorStore
from ..storage.metadata_store import MetadataStore, SymbolRecord


@dataclass
class IndexStats:
    """Statistics from indexing operation"""
    files_processed: int = 0
    files_failed: int = 0
    total_symbols: int = 0
    functions_indexed: int = 0
    classes_indexed: int = 0
    methods_indexed: int = 0
    time_taken: float = 0.0
    total_lines: int = 0


class Indexer:
    """Orchestrates the code indexing pipeline"""

    def __init__(
        self,
        parser: Optional[CodeParser] = None,
        embedder: Optional[CodeEmbedder] = None,
        vector_store: Optional[VectorStore] = None,
        metadata_store: Optional[MetadataStore] = None,
        text_search: Optional[TextSearchEngine] = None
    ):
        """
        Initialize indexer with components

        Args:
            parser: CodeParser instance
            embedder: CodeEmbedder instance
            vector_store: VectorStore instance
            metadata_store: MetadataStore instance
            text_search: TextSearchEngine instance
        """
        self.parser = parser or CodeParser()
        self.js_parser = JSParser()
        self.embedder = embedder or CodeEmbedder()
        self.vector_store = vector_store or VectorStore()
        self.metadata_store = metadata_store or MetadataStore()
        self.text_search = text_search or TextSearchEngine()

        # Supported file extensions
        self.python_extensions = {'.py'}
        self.js_extensions = {'.js', '.jsx', '.ts', '.tsx'}
        self.all_extensions = self.python_extensions | self.js_extensions

        logger.info("Indexer initialized with multi-language support")

    def index_directory(self, directory_path: str, show_progress: bool = True) -> IndexStats:
        """
        Index all supported code files in a directory

        Args:
            directory_path: Path to directory containing code files
            show_progress: Whether to show progress bar

        Returns:
            IndexStats with indexing statistics
        """
        start_time = time.time()
        stats = IndexStats()

        # Find all supported files
        directory = Path(directory_path)
        all_files = []

        # Collect files for each extension
        for ext in self.all_extensions:
            pattern = f"*{ext}"
            files = list(directory.rglob(pattern))
            all_files.extend(files)

        # Filter out node_modules, __pycache__, dist, build directories
        excluded_dirs = {'node_modules', '__pycache__', 'dist', 'build', '.git', 'venv', 'env', '.venv'}
        all_files = [
            f for f in all_files
            if not any(excluded in f.parts for excluded in excluded_dirs)
        ]

        logger.info(f"Found {len(all_files)} code files in {directory_path}")

        # Process files with progress bar
        iterator = tqdm(all_files, desc="Indexing files") if show_progress else all_files

        for code_file in iterator:
            try:
                file_stats = self.index_file(str(code_file))

                # Update stats
                stats.files_processed += 1
                stats.total_symbols += file_stats.total_symbols
                stats.functions_indexed += file_stats.functions_indexed
                stats.classes_indexed += file_stats.classes_indexed
                stats.methods_indexed += file_stats.methods_indexed
                stats.total_lines += file_stats.total_lines

            except Exception as e:
                logger.error(f"Failed to index {code_file}: {e}")
                stats.files_failed += 1

        stats.time_taken = time.time() - start_time

        logger.info(f"Indexing complete: {stats.files_processed} files, {stats.total_symbols} symbols in {stats.time_taken:.2f}s")

        return stats

    def index_file(self, file_path: str) -> IndexStats:
        """
        Index a single code file (Python or JavaScript/TypeScript)

        Args:
            file_path: Path to code file

        Returns:
            IndexStats for this file
        """
        stats = IndexStats()
        file_ext = Path(file_path).suffix.lower()

        # Parse file based on extension
        if file_ext in self.python_extensions:
            parsed_file = self.parser.parse_file(file_path)
            if not parsed_file:
                logger.warning(f"Failed to parse Python file {file_path}")
                stats.files_failed = 1
                return stats

            # Add file to metadata store
            file_id = self.metadata_store.add_file(
                path=file_path,
                total_lines=parsed_file.total_lines
            )
            stats.total_lines = parsed_file.total_lines

            # Extract symbols from Python file
            symbols_to_index = self._extract_python_symbols(parsed_file, stats)

        elif file_ext in self.js_extensions:
            parsed_file = self.js_parser.parse_file(file_path)
            if not parsed_file:
                logger.warning(f"Failed to parse JS/TS file {file_path}")
                stats.files_failed = 1
                return stats

            # Add file to metadata store
            file_id = self.metadata_store.add_file(
                path=file_path,
                total_lines=parsed_file.total_lines
            )
            stats.total_lines = parsed_file.total_lines

            # Extract symbols from JS/TS file
            symbols_to_index = self._extract_js_symbols(parsed_file, stats)
        else:
            logger.warning(f"Unsupported file type: {file_path}")
            stats.files_failed = 1
            return stats

        stats.total_symbols = len(symbols_to_index)

        if symbols_to_index:
            # Generate embeddings for all symbols
            self._index_symbols(symbols_to_index, file_id, file_path)

        stats.files_processed = 1
        return stats

    def _extract_python_symbols(self, parsed_file: ParsedFile, stats: IndexStats) -> List[Dict]:
        """Extract symbols from parsed Python file"""
        symbols_to_index = []

        # Add module-level functions
        for func in parsed_file.functions:
            symbols_to_index.append({
                'type': 'function',
                'data': func
            })
            stats.functions_indexed += 1

        # Add classes and their methods
        for cls in parsed_file.classes:
            # Add the class itself
            symbols_to_index.append({
                'type': 'class',
                'data': cls
            })
            stats.classes_indexed += 1

            # Add methods
            for method in cls.methods:
                symbols_to_index.append({
                    'type': 'method',
                    'data': method,
                    'parent_class': cls.name
                })
                stats.methods_indexed += 1

        return symbols_to_index

    def _extract_js_symbols(self, parsed_file: ParsedJSFile, stats: IndexStats) -> List[Dict]:
        """Extract symbols from parsed JavaScript/TypeScript file"""
        symbols_to_index = []

        # Add functions (including React components)
        for func in parsed_file.functions:
            # Create a compatible data object
            func_data = type('JSFunction', (), {
                'name': func.name,
                'code': func.code,
                'start_line': func.start_line,
                'end_line': func.end_line,
                'docstring': func.docstring
            })()

            symbols_to_index.append({
                'type': 'function',
                'data': func_data
            })
            stats.functions_indexed += 1

        # Add classes and their methods
        for cls in parsed_file.classes:
            # Create compatible class data object
            cls_data = type('JSClass', (), {
                'name': cls.name,
                'code': cls.code,
                'start_line': cls.start_line,
                'end_line': cls.end_line,
                'docstring': cls.docstring
            })()

            symbols_to_index.append({
                'type': 'class',
                'data': cls_data
            })
            stats.classes_indexed += 1

            # Add methods
            for method in cls.methods:
                method_data = type('JSMethod', (), {
                    'name': method.name,
                    'code': method.code,
                    'start_line': method.start_line,
                    'end_line': method.end_line,
                    'docstring': method.docstring
                })()

                symbols_to_index.append({
                    'type': 'method',
                    'data': method_data,
                    'parent_class': cls.name
                })
                stats.methods_indexed += 1

        return symbols_to_index

    def _index_symbols(self, symbols: List[Dict], file_id: int, file_path: str):
        """
        Generate embeddings and store symbols

        Args:
            symbols: List of symbol dictionaries
            file_id: Database file ID
            file_path: Path to source file
        """
        # Extract code snippets
        codes = []
        for symbol in symbols:
            data = symbol['data']
            # Combine name, docstring, and code for better semantic matching
            code_text = f"{data.name}\n{data.docstring or ''}\n{data.code}"
            codes.append(code_text)

        # Generate embeddings in batch
        embeddings = self.embedder.batch_generate(codes, batch_size=16)

        # Convert to numpy array
        embeddings_array = np.array(embeddings, dtype=np.float32)

        # Add to vector store
        # Get current vector count (this will be our starting ID)
        start_embedding_id = self.vector_store.vector_count

        # Prepare metadata for vector store
        vector_metadata = []
        for i, symbol in enumerate(symbols):
            data = symbol['data']
            vector_metadata.append({
                'file_path': file_path,
                'symbol_name': data.name,
                'symbol_type': symbol['type'],
                'start_line': data.start_line,
                'end_line': data.end_line
            })

        # Add to vector store
        self.vector_store.add(embeddings_array, vector_metadata)

        # Create symbol records for metadata store
        symbol_records = []
        for i, symbol in enumerate(symbols):
            data = symbol['data']
            embedding_id = start_embedding_id + i

            record = SymbolRecord(
                file_id=file_id,
                name=data.name,
                symbol_type=symbol['type'],
                code=data.code,
                start_line=data.start_line,
                end_line=data.end_line,
                docstring=data.docstring,
                embedding_id=embedding_id
            )
            symbol_records.append(record)

        # Add to metadata store
        self.metadata_store.add_symbols_batch(symbol_records)

        # Add to text search index
        text_docs = []
        for i, symbol in enumerate(symbols):
            data = symbol['data']
            embedding_id = start_embedding_id + i
            text_docs.append((embedding_id, {
                'name': data.name,
                'symbol_type': symbol['type'],
                'code': data.code,
                'docstring': data.docstring
            }))
        self.text_search.add_documents_batch(text_docs)

        logger.debug(f"Indexed {len(symbols)} symbols from {file_path}")

    def get_stats(self) -> Dict[str, Any]:
        """
        Get current index statistics

        Returns:
            Dictionary with statistics
        """
        db_stats = self.metadata_store.get_stats()
        vector_stats = self.vector_store.get_stats()

        return {
            'database': db_stats,
            'vector_store': vector_stats,
            'total_indexed_symbols': db_stats.get('total_symbols', 0)
        }

    def clear_index(self):
        """Clear all indexed data"""
        logger.warning("Clearing index...")
        self.metadata_store.clear()
        self.vector_store.clear()
        self.text_search.clear()
        logger.info("Index cleared")

    def save_index(self, save_dir: str):
        """
        Save vector store to disk (metadata store auto-persists)

        Args:
            save_dir: Directory to save to
        """
        logger.info(f"Saving index to {save_dir}")
        self.vector_store.save(save_dir)
        logger.info("Index saved")

    def load_index(self, load_dir: str):
        """
        Load vector store from disk

        Args:
            load_dir: Directory to load from
        """
        logger.info(f"Loading index from {load_dir}")
        self.vector_store.load(load_dir)
        logger.info("Index loaded")


def main():
    """Test the indexer"""
    import tempfile
    import os

    # Create test Python files
    test_dir = tempfile.mkdtemp()

    test_file1 = os.path.join(test_dir, 'test1.py')
    with open(test_file1, 'w') as f:
        f.write('''
def authenticate_user(username: str, password: str) -> bool:
    """Authenticate a user with credentials"""
    return check_credentials(username, password)

def login(email: str, pwd: str):
    """User login function"""
    return authenticate_user(email, pwd)

class UserManager:
    """Manages user accounts"""

    def create_user(self, username: str):
        """Create a new user"""
        pass

    def delete_user(self, user_id: int):
        """Delete a user"""
        pass
''')

    test_file2 = os.path.join(test_dir, 'test2.py')
    with open(test_file2, 'w') as f:
        f.write('''
def connect_database(host: str, port: int):
    """Connect to database server"""
    return create_connection(host, port)

def query_data(sql: str):
    """Execute SQL query"""
    return execute_query(sql)
''')

    try:
        # Create indexer
        indexer = Indexer()

        # Index directory
        print(f"Indexing directory: {test_dir}")
        stats = indexer.index_directory(test_dir, show_progress=False)

        print(f"\nIndexing Stats:")
        print(f"  Files processed: {stats.files_processed}")
        print(f"  Total symbols: {stats.total_symbols}")
        print(f"  Functions: {stats.functions_indexed}")
        print(f"  Classes: {stats.classes_indexed}")
        print(f"  Methods: {stats.methods_indexed}")
        print(f"  Time taken: {stats.time_taken:.2f}s")

        # Get stats
        index_stats = indexer.get_stats()
        print(f"\nIndex Stats:")
        print(f"  {index_stats}")

    finally:
        # Cleanup
        import shutil
        shutil.rmtree(test_dir)


if __name__ == "__main__":
    main()
