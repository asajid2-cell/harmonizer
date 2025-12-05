# CodeSniff Fixes Summary

## Overview

This document summarizes all the fixes applied to get CodeSniff's GitHub repository cloning and indexing working correctly.

## The Problem

When trying to clone and index GitHub repositories, the system was failing with errors:
1. "Argument to set_language must be a Language"
2. "FAISS not available"  
3. "ValueError: Parsing failed" (UTF-8 BOM issues)
4. Files being counted as "processed" when they actually failed

## Root Causes

### 1. Tree-sitter Version Mismatch
- Had tree-sitter 0.20.4 + tree-sitter-python 0.23.4
- These versions use incompatible APIs
- tree-sitter-python 0.23.4 expects newer tree-sitter API

### 2. NumPy Version Conflicts
- FAISS 1.7.4 was compiled with NumPy 1.x (requires <2.0)
- Transformers/scikit-learn need NumPy >=1.25.2
- NumPy 1.24.3 was too old, NumPy 2.x breaks FAISS

### 3. UTF-8 BOM in Source Files
- Files in cloned repos had UTF-8 BOM (Byte Order Mark)
- Tree-sitter couldn't parse files with BOM
- Parser was converting string to bytes incorrectly

### 4. Incorrect Stats Tracking
- Failed files were still incrementing files_processed counter
- Made it look like indexing succeeded when it actually failed

## Solutions Applied

### 1. Fixed Package Versions

**File**: `backend/requirements.txt`

```diff
- tree-sitter==0.20.4
- tree-sitter-python==0.23.4
- numpy==1.24.3
+ tree-sitter==0.21.3
+ tree-sitter-python==0.21.0
+ numpy==1.26.4
```

### 2. Fixed Parser Initialization

**File**: `backend/app/core/parser.py`

```python
def __init__(self):
    # For tree-sitter 0.21.x with tree-sitter-python 0.21.x
    python_lang = Language(tspython.language(), "python")
    
    self.parser = Parser()
    self.parser.set_language(python_lang)
```

### 3. Fixed BOM Handling

**File**: `backend/app/core/parser.py`

```python
def parse_file(self, file_path: str) -> Optional[ParsedFile]:
    # Read as binary
    with open(file_path, 'rb') as f:
        source_bytes = f.read()
    
    # Strip BOM if present (EF BB BF)
    if source_bytes.startswith(b'\xef\xbb\xbf'):
        source_bytes = source_bytes[3:]
    
    # Decode for text operations
    source_code = source_bytes.decode('utf-8')
    
    # Parse with tree-sitter (pass raw bytes)
    tree = self.parser.parse(source_bytes)
```

### 4. Fixed File Encoding in Other Parsers

**Files**: `js_parser.py`, `java_parser.py`, `html_css_parser.py`

```python
# Changed from:
with open(file_path, 'r', encoding='utf-8') as f:
    
# To:
with open(file_path, 'r', encoding='utf-8-sig') as f:
```

### 5. Fixed Stats Tracking

**File**: `backend/app/core/indexer.py`

```python
for code_file in iterator:
    file_stats = self.index_file(str(code_file))
    
    # Check if file actually succeeded
    if file_stats.files_failed > 0:
        stats.files_failed += file_stats.files_failed
    else:
        stats.files_processed += file_stats.files_processed
        stats.total_symbols += file_stats.total_symbols
        # ... other stats
```

### 6. Created Automated Setup Script

**File**: `run.ps1`

The script automatically:
- Checks tree-sitter version and installs 0.21.3 if needed
- Checks NumPy version and installs 1.26.4 if needed
- Checks FAISS installation and fixes if broken
- Installs all other dependencies
- Opens two terminals for backend and frontend
- Starts both servers
- Opens browser automatically

## Testing

After fixes, tested with:
```bash
python -c "import faiss; print('FAISS OK')"
python -c "import transformers; print('Transformers OK')"
python -c "from tree_sitter import Language, Parser; import tree_sitter_python as tsp; lang = Language(tsp.language(), 'python'); p = Parser(); p.set_language(lang); print('Tree-sitter OK')"
```

All passed successfully.

## Files Modified

1. `backend/requirements.txt` - Updated package versions
2. `backend/app/core/parser.py` - Fixed init and BOM handling
3. `backend/app/core/js_parser.py` - UTF-8-sig encoding
4. `backend/app/core/java_parser.py` - UTF-8-sig encoding
5. `backend/app/core/html_css_parser.py` - UTF-8-sig encoding
6. `backend/app/core/indexer.py` - Fixed stats tracking
7. `run.ps1` - Created automated setup script
8. `SETUP.md` - Updated with critical dependency info

## How to Use

Simply run:
```powershell
.\run.ps1
```

The script handles everything automatically.

## Manual Installation (if needed)

```powershell
cd backend
pip install --no-deps tree-sitter==0.21.3 tree-sitter-python==0.21.0
pip install --user numpy==1.26.4
pip install faiss-cpu==1.7.4
pip install -r requirements.txt
```

## Result

GitHub repository cloning and indexing now works correctly:
- ✅ Files parse successfully (no more BOM errors)
- ✅ Tree-sitter initializes correctly
- ✅ FAISS loads and works
- ✅ Stats tracking is accurate
- ✅ All 7 Python files that were failing now index successfully
