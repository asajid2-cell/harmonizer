"""
Groq-powered chatbot for CodeSniff
Helps users troubleshoot, understand, and run codebases
"""

import os
from typing import List, Dict, Optional
from groq import Groq
from loguru import logger


class CodeSniffChatbot:
    """Intelligent chatbot powered by Groq for code assistance"""

    def __init__(self, api_key: Optional[str] = None):
        """
        Initialize chatbot with Groq API

        Args:
            api_key: Groq API key (defaults to GROQ_API_KEY env var)
        """
        self.api_key = api_key or os.getenv("GROQ_API_KEY")
        if not self.api_key:
            raise ValueError("GROQ_API_KEY environment variable not set")

        self.client = Groq(api_key=self.api_key)
        self.model = "llama-3.3-70b-versatile"  # Latest Llama model for complex reasoning

        self.system_prompt = """You are an expert code assistant for CodeSniff, a semantic code search engine.

Your role is to help developers:
1. Understand how to use CodeSniff
2. Troubleshoot issues with their projects
3. Set up and run projects from scratch
4. Debug code and explain what it does
5. Answer questions about codebases

Key CodeSniff features:
- Semantic code search using natural language queries
- Supports Python and JavaScript/TypeScript
- Uses CodeBERT embeddings + FAISS for fast search
- Hybrid search: BM25 text search + semantic similarity
- Minimum 40% similarity threshold to filter irrelevant results

How to use CodeSniff:
- Index code: POST /api/index with directory_path
- Search: POST /api/search with query
- View stats: GET /api/stats
- Clear index: POST /api/index/clear

When helping users:
- Be concise and practical
- Provide specific commands they can run
- Explain errors clearly
- Suggest debugging steps
- Reference actual code when available

If you don't know something, say so. Don't make up information."""

    def chat(
        self,
        message: str,
        conversation_history: Optional[List[Dict[str, str]]] = None,
        code_context: Optional[str] = None,
        temperature: float = 0.3,
        max_tokens: int = 1024
    ) -> str:
        """
        Send a message to the chatbot and get a response

        Args:
            message: User's question/message
            conversation_history: Previous messages in the conversation
            code_context: Relevant code snippets from search results
            temperature: Response randomness (0-1, lower = more focused)
            max_tokens: Maximum response length

        Returns:
            Chatbot's response
        """
        try:
            # Build messages array
            messages = [{"role": "system", "content": self.system_prompt}]

            # Add conversation history if provided
            if conversation_history:
                messages.extend(conversation_history)

            # Add code context if provided (from RAG)
            if code_context:
                enhanced_message = f"""Question: {message}

Relevant code from the codebase:
{code_context}

Please answer the question using the code context above when relevant."""
                messages.append({"role": "user", "content": enhanced_message})
            else:
                messages.append({"role": "user", "content": message})

            # Call Groq API
            logger.info(f"Sending chat request to Groq (model: {self.model})")
            response = self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=temperature,
                max_tokens=max_tokens,
                top_p=1,
                stream=False
            )

            answer = response.choices[0].message.content
            logger.info(f"Received response ({len(answer)} chars)")

            return answer

        except Exception as e:
            logger.error(f"Chat error: {e}")
            raise


class CodeSniffRAG:
    """Retrieval-Augmented Generation for code questions"""

    def __init__(self, chatbot: CodeSniffChatbot, search_engine):
        """
        Initialize RAG system

        Args:
            chatbot: CodeSniffChatbot instance
            search_engine: SearchEngine instance for retrieving relevant code
        """
        self.chatbot = chatbot
        self.search_engine = search_engine

    def answer_with_context(
        self,
        question: str,
        conversation_history: Optional[List[Dict[str, str]]] = None,
        num_results: int = 5
    ) -> Dict[str, any]:
        """
        Answer a question with relevant code context from the codebase

        Args:
            question: User's question
            conversation_history: Previous conversation messages
            num_results: Number of code results to retrieve for context

        Returns:
            Dict with 'answer', 'sources', and 'search_results'
        """
        try:
            # Search codebase for relevant code
            logger.info(f"Searching codebase for: {question}")
            search_results = self.search_engine.search(
                query=question,
                limit=num_results,
                min_similarity=0.3  # Lower threshold for broader context
            )

            # Build code context from search results
            if search_results:
                context_parts = []
                for i, result in enumerate(search_results[:num_results], 1):
                    context_parts.append(
                        f"[{i}] File: {result.file_path}:{result.start_line}\n"
                        f"Function/Class: {result.symbol_name} ({result.symbol_type})\n"
                        f"Code:\n{result.code_snippet}\n"
                    )
                    if result.docstring:
                        context_parts.append(f"Description: {result.docstring}\n")

                code_context = "\n---\n".join(context_parts)
                logger.info(f"Retrieved {len(search_results)} code snippets for context")
            else:
                code_context = None
                logger.info("No relevant code found in codebase")

            # Get answer from chatbot with code context
            answer = self.chatbot.chat(
                message=question,
                conversation_history=conversation_history,
                code_context=code_context
            )

            # Prepare response
            sources = []
            if search_results:
                sources = [
                    {
                        "file": result.file_path,
                        "line": result.start_line,
                        "symbol": result.symbol_name,
                        "similarity": round(result.similarity_score * 100)
                    }
                    for result in search_results[:num_results]
                ]

            return {
                "answer": answer,
                "sources": sources,
                "used_rag": code_context is not None
            }

        except Exception as e:
            logger.error(f"RAG error: {e}")
            # Fallback to chatbot without context
            answer = self.chatbot.chat(
                message=question,
                conversation_history=conversation_history
            )
            return {
                "answer": answer,
                "sources": [],
                "used_rag": False,
                "error": str(e)
            }
