"""Setup script for CodeScope backend"""

from setuptools import setup, find_packages

setup(
    name="codescope",
    version="1.0.0",
    description="Semantic Code Search Engine",
    author="Your Name",
    packages=find_packages(),
    install_requires=[
        "fastapi>=0.104.1",
        "uvicorn[standard]>=0.24.0",
        "tree-sitter>=0.20.4",
        "tree-sitter-python>=0.20.4",
        "torch>=2.1.0",
        "transformers>=4.35.0",
        "sentence-transformers>=2.2.2",
        "faiss-cpu>=1.7.4",
        "numpy>=1.24.3",
        "aiosqlite>=0.19.0",
        "pydantic>=2.5.0",
        "python-dotenv>=1.0.0",
        "loguru>=0.7.2",
        "tqdm>=4.66.1",
    ],
    extras_require={
        "dev": [
            "pytest>=7.4.3",
            "httpx>=0.25.1",
        ],
    },
    python_requires=">=3.10",
)
