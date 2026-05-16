"""Text-based search using BM25 algorithm for keyword matching"""

import re
import math
from typing import List, Dict, Any, Set, Tuple
from dataclasses import dataclass
from collections import defaultdict
from loguru import logger


@dataclass
class TextSearchResult:
    """Result from text search"""
    symbol_id: int
    score: float
    matched_terms: List[str]


class TextSearchEngine:
    """BM25-based text search for code symbols"""

    def __init__(self, k1: float = 1.5, b: float = 0.75):
        """
        Initialize BM25 search engine

        Args:
            k1: Term frequency saturation parameter
            b: Length normalization parameter
        """
        self.k1 = k1
        self.b = b

        # Index structures
        self.documents: Dict[int, Dict[str, Any]] = {}  # id -> document
        self.inverted_index: Dict[str, Set[int]] = defaultdict(set)  # term -> doc_ids
        self.doc_lengths: Dict[int, int] = {}  # id -> length
        self.avg_doc_length = 0.0
        self.doc_count = 0

        # Stopwords for code
        self.stopwords = {
            'self', 'def', 'class', 'return', 'if', 'else', 'elif', 'for',
            'while', 'try', 'except', 'finally', 'with', 'as', 'import',
            'from', 'in', 'is', 'not', 'and', 'or', 'none', 'true', 'false',
            'the', 'a', 'an', 'of', 'to', 'that', 'this', 'it', 'be', 'are'
        }

        # Domain-specific synonyms for query expansion
        self.synonyms = {
            'audio': ['sound', 'wav', 'mp3', 'music', 'speaker', 'volume'],
            'animation': ['animate', 'animated', 'animating', 'motion', 'transition'],
            'animate': ['animation', 'animated', 'animating', 'motion'],
            'database': ['db', 'sql', 'sqlite', 'postgres', 'mysql', 'query'],
            'db': ['database', 'sql', 'sqlite'],
            'auth': ['authentication', 'authorize', 'login', 'credential'],
            'authentication': ['auth', 'login', 'credential', 'password', 'user'],
            'login': ['auth', 'signin', 'authentication'],
            'error': ['exception', 'fail', 'invalid', 'problem'],
            'exception': ['error', 'raise', 'catch', 'handle'],
            'config': ['configuration', 'settings', 'options', 'preferences'],
            'configuration': ['config', 'settings', 'setup'],
            'http': ['request', 'response', 'api', 'rest', 'web'],
            'api': ['endpoint', 'route', 'http', 'rest'],
            'file': ['path', 'directory', 'folder', 'io'],
            'parse': ['parser', 'parsing', 'extract', 'analyze'],
            'parser': ['parse', 'parsing', 'tokenize'],
            'test': ['testing', 'unittest', 'pytest', 'spec'],
            'valid': ['validate', 'validation', 'validator', 'check'],
            'validate': ['valid', 'validation', 'validator', 'verify'],
            'connect': ['connection', 'connected', 'connecting', 'link'],
            'connection': ['connect', 'connected', 'link', 'socket'],
            'index': ['indexer', 'indexing', 'indexed'],
            'indexer': ['index', 'indexing'],
            'search': ['find', 'query', 'lookup', 'match'],
            'user': ['account', 'profile', 'member'],
            'create': ['make', 'new', 'add', 'insert', 'generate'],
            'delete': ['remove', 'destroy', 'drop'],
            'update': ['modify', 'change', 'edit', 'patch'],
            'get': ['fetch', 'retrieve', 'read', 'obtain'],
            'set': ['assign', 'store', 'write', 'put'],
            'load': ['read', 'import', 'fetch', 'retrieve'],
            'save': ['write', 'store', 'export', 'persist'],
            'send': ['transmit', 'emit', 'dispatch', 'post'],
            'receive': ['get', 'accept', 'handle'],
            'process': ['handle', 'execute', 'run', 'perform'],
            'handle': ['process', 'manage', 'deal'],
            'cache': ['store', 'buffer', 'memory'],
            'encrypt': ['encryption', 'hash', 'secure', 'crypto'],
            'decrypt': ['decryption', 'decode'],
        }

        logger.info("TextSearchEngine initialized")

    def tokenize(self, text: str) -> List[str]:
        """
        Tokenize text into terms

        Args:
            text: Input text

        Returns:
            List of tokens
        """
        # Convert to lowercase
        text = text.lower()

        # Split camelCase and snake_case
        text = re.sub(r'([a-z])([A-Z])', r'\1 \2', text)
        text = text.replace('_', ' ')

        # Extract alphanumeric tokens
        tokens = re.findall(r'[a-z]+[0-9]*|[0-9]+', text)

        # Filter stopwords and short tokens
        tokens = [t for t in tokens if t not in self.stopwords and len(t) >= 2]

        return tokens

    def stem(self, word: str) -> str:
        """
        Simple stemming for code-related terms

        Args:
            word: Input word

        Returns:
            Stemmed word
        """
        # Simple suffix removal for common patterns
        suffixes = [
            'tion', 'sion', 'ment', 'ness', 'able', 'ible',
            'ing', 'ed', 'er', 'est', 'ly', 'es', 's'
        ]

        for suffix in suffixes:
            if word.endswith(suffix) and len(word) - len(suffix) >= 3:
                return word[:-len(suffix)]

        return word

    def expand_query(self, tokens: List[str]) -> List[str]:
        """
        Expand query tokens with synonyms and stemmed variants

        Args:
            tokens: Original query tokens

        Returns:
            Expanded list of tokens
        """
        expanded = set(tokens)

        for token in tokens:
            # Add stemmed version
            stemmed = self.stem(token)
            expanded.add(stemmed)

            # Add synonyms
            if token in self.synonyms:
                for syn in self.synonyms[token]:
                    expanded.add(syn)
                    expanded.add(self.stem(syn))

            # Check if stemmed version has synonyms
            if stemmed in self.synonyms:
                for syn in self.synonyms[stemmed]:
                    expanded.add(syn)
                    expanded.add(self.stem(syn))

        return list(expanded)

    def levenshtein_distance(self, s1: str, s2: str) -> int:
        """Calculate Levenshtein distance between two strings"""
        if len(s1) < len(s2):
            return self.levenshtein_distance(s2, s1)

        if len(s2) == 0:
            return len(s1)

        prev_row = range(len(s2) + 1)
        for i, c1 in enumerate(s1):
            curr_row = [i + 1]
            for j, c2 in enumerate(s2):
                insertions = prev_row[j + 1] + 1
                deletions = curr_row[j] + 1
                substitutions = prev_row[j] + (c1 != c2)
                curr_row.append(min(insertions, deletions, substitutions))
            prev_row = curr_row

        return prev_row[-1]

    def find_fuzzy_matches(self, token: str, max_distance: int = 2) -> List[str]:
        """
        Find terms in index that are similar to token (fuzzy match)

        Args:
            token: Query token
            max_distance: Maximum Levenshtein distance

        Returns:
            List of similar terms from the index
        """
        matches = []

        # Only check terms of similar length
        min_len = max(1, len(token) - max_distance)
        max_len = len(token) + max_distance

        for term in self.inverted_index.keys():
            # Skip stem entries
            if term.startswith("stem:"):
                continue

            if min_len <= len(term) <= max_len:
                distance = self.levenshtein_distance(token, term)
                if 0 < distance <= max_distance:
                    matches.append(term)

        return matches

    def get_searchable_text(self, symbol: Dict[str, Any]) -> str:
        """
        Extract searchable text from symbol

        Args:
            symbol: Symbol dictionary

        Returns:
            Combined searchable text
        """
        parts = []

        # Name is most important - add multiple times for weight
        name = symbol.get('name', '')
        parts.extend([name] * 3)

        # Docstring is very important
        docstring = symbol.get('docstring', '') or ''
        parts.extend([docstring] * 2)

        # Code content
        code = symbol.get('code', '')
        parts.append(code)

        # Symbol type
        symbol_type = symbol.get('symbol_type', '')
        parts.append(symbol_type)

        return ' '.join(parts)

    def add_document(self, doc_id: int, symbol: Dict[str, Any]):
        """
        Add a document to the index

        Args:
            doc_id: Unique document ID
            symbol: Symbol data
        """
        text = self.get_searchable_text(symbol)
        tokens = self.tokenize(text)

        # Apply stemming
        stemmed_tokens = [self.stem(t) for t in tokens]

        # Store document
        self.documents[doc_id] = {
            'symbol': symbol,
            'tokens': tokens,
            'stemmed': stemmed_tokens,
            'token_set': set(tokens),
            'stemmed_set': set(stemmed_tokens)
        }

        # Update inverted index
        for token in set(tokens):
            self.inverted_index[token].add(doc_id)

        # Stemmed terms
        for token in set(stemmed_tokens):
            self.inverted_index[f"stem:{token}"].add(doc_id)

        # Document length
        self.doc_lengths[doc_id] = len(tokens)

        # Update stats
        self.doc_count = len(self.documents)
        total_length = sum(self.doc_lengths.values())
        self.avg_doc_length = total_length / self.doc_count if self.doc_count > 0 else 0

    def add_documents_batch(self, symbols: List[Tuple[int, Dict[str, Any]]]):
        """
        Add multiple documents efficiently

        Args:
            symbols: List of (doc_id, symbol) tuples
        """
        for doc_id, symbol in symbols:
            text = self.get_searchable_text(symbol)
            tokens = self.tokenize(text)
            stemmed_tokens = [self.stem(t) for t in tokens]

            self.documents[doc_id] = {
                'symbol': symbol,
                'tokens': tokens,
                'stemmed': stemmed_tokens,
                'token_set': set(tokens),
                'stemmed_set': set(stemmed_tokens)
            }

            for token in set(tokens):
                self.inverted_index[token].add(doc_id)

            for token in set(stemmed_tokens):
                self.inverted_index[f"stem:{token}"].add(doc_id)

            self.doc_lengths[doc_id] = len(tokens)

        # Update stats
        self.doc_count = len(self.documents)
        total_length = sum(self.doc_lengths.values())
        self.avg_doc_length = total_length / self.doc_count if self.doc_count > 0 else 0

        logger.debug(f"Added {len(symbols)} documents to text index")

    def idf(self, term: str) -> float:
        """
        Calculate inverse document frequency

        Args:
            term: Search term

        Returns:
            IDF score
        """
        doc_freq = len(self.inverted_index.get(term, set()))
        if doc_freq == 0:
            return 0.0

        return math.log((self.doc_count - doc_freq + 0.5) / (doc_freq + 0.5) + 1)

    def bm25_score(self, doc_id: int, query_terms: List[str]) -> Tuple[float, List[str]]:
        """
        Calculate BM25 score for a document

        Args:
            doc_id: Document ID
            query_terms: List of query terms

        Returns:
            Tuple of (score, matched_terms)
        """
        if doc_id not in self.documents:
            return 0.0, []

        doc = self.documents[doc_id]
        doc_length = self.doc_lengths[doc_id]
        score = 0.0
        matched_terms = []

        for term in query_terms:
            # Check exact match
            if term in doc['token_set']:
                tf = doc['tokens'].count(term)
                idf = self.idf(term)
                matched_terms.append(term)
            # Check stemmed match
            elif self.stem(term) in doc['stemmed_set']:
                tf = doc['stemmed'].count(self.stem(term))
                idf = self.idf(f"stem:{self.stem(term)}")
                matched_terms.append(f"~{term}")
            else:
                continue

            # BM25 formula
            numerator = tf * (self.k1 + 1)
            denominator = tf + self.k1 * (1 - self.b + self.b * doc_length / self.avg_doc_length)
            score += idf * numerator / denominator

        return score, matched_terms

    def search(self, query: str, limit: int = 100) -> List[TextSearchResult]:
        """
        Search for documents matching query

        Args:
            query: Search query
            limit: Maximum results

        Returns:
            List of TextSearchResult
        """
        if not self.documents:
            return []

        # Tokenize query
        query_tokens = self.tokenize(query)
        if not query_tokens:
            return []

        # Expand query with synonyms and stems
        expanded_tokens = self.expand_query(query_tokens)
        logger.debug(f"Query expansion: {query_tokens} -> {expanded_tokens}")

        # Find candidate documents
        candidates = set()
        fuzzy_tokens = set()

        for token in expanded_tokens:
            # Exact matches
            candidates.update(self.inverted_index.get(token, set()))
            # Stemmed matches
            candidates.update(self.inverted_index.get(f"stem:{self.stem(token)}", set()))

        # If no candidates found, try fuzzy matching for typos
        if not candidates and len(query_tokens) <= 3:
            for token in query_tokens:
                if len(token) >= 4:  # Only fuzzy match longer tokens
                    fuzzy_matches = self.find_fuzzy_matches(token, max_distance=1)
                    for fuzzy_term in fuzzy_matches[:5]:  # Limit fuzzy matches
                        fuzzy_tokens.add(fuzzy_term)
                        candidates.update(self.inverted_index.get(fuzzy_term, set()))

            if fuzzy_tokens:
                logger.debug(f"Fuzzy matches for typos: {fuzzy_tokens}")

        if not candidates:
            return []

        # Score candidates - use original tokens for primary scoring,
        # but also check expanded tokens
        results = []
        for doc_id in candidates:
            # Primary score from original tokens
            score, matched = self.bm25_score(doc_id, query_tokens)

            # Boost from expanded tokens (with lower weight)
            if score == 0:
                expanded_score, expanded_matched = self.bm25_score(doc_id, expanded_tokens)
                score = expanded_score * 0.7  # Reduced weight for synonym matches
                matched = [f"~{m}" for m in expanded_matched]  # Mark as synonym match

            if score > 0:
                results.append(TextSearchResult(
                    symbol_id=doc_id,
                    score=score,
                    matched_terms=matched
                ))

        # Sort by score
        results.sort(key=lambda r: r.score, reverse=True)

        return results[:limit]

    def clear(self):
        """Clear all indexed data"""
        self.documents.clear()
        self.inverted_index.clear()
        self.doc_lengths.clear()
        self.avg_doc_length = 0.0
        self.doc_count = 0
        logger.info("Text search index cleared")

    def get_stats(self) -> Dict[str, Any]:
        """Get index statistics"""
        return {
            'total_documents': self.doc_count,
            'unique_terms': len(self.inverted_index),
            'avg_doc_length': self.avg_doc_length
        }

    def autocomplete(self, prefix: str, limit: int = 10) -> List[str]:
        """
        Get autocomplete suggestions for a prefix

        Args:
            prefix: Query prefix
            limit: Maximum suggestions

        Returns:
            List of suggested terms
        """
        if not prefix or len(prefix) < 2:
            return []

        prefix_lower = prefix.lower()
        suggestions = []

        # Find matching terms in inverted index
        for term in self.inverted_index.keys():
            if term.startswith("stem:"):
                continue
            if term.startswith(prefix_lower):
                # Score by document frequency
                doc_freq = len(self.inverted_index[term])
                suggestions.append((term, doc_freq))

        # Sort by frequency (most common first)
        suggestions.sort(key=lambda x: x[1], reverse=True)

        return [s[0] for s in suggestions[:limit]]

    def get_popular_terms(self, limit: int = 20) -> List[str]:
        """
        Get most frequently occurring terms

        Args:
            limit: Maximum terms to return

        Returns:
            List of popular terms
        """
        term_freqs = []
        for term, doc_ids in self.inverted_index.items():
            if term.startswith("stem:"):
                continue
            term_freqs.append((term, len(doc_ids)))

        term_freqs.sort(key=lambda x: x[1], reverse=True)
        return [t[0] for t in term_freqs[:limit]]
