"""Run a synthetic CodeSniff fast-index benchmark."""

import argparse
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from loguru import logger

from app.core.fast_index_benchmark import benchmark_result_json, run_fast_index_benchmark


def main() -> int:
    parser = argparse.ArgumentParser(description="Benchmark lexical-first CodeSniff indexing on a synthetic repo.")
    parser.add_argument("--workdir", type=Path, default=None, help="Optional benchmark workspace to reuse/inspect.")
    parser.add_argument("--files", type=int, default=1000, help="Number of source files to generate.")
    parser.add_argument("--symbols-per-file", type=int, default=3, help="Functions per generated Python file.")
    parser.add_argument("--pruned-files", type=int, default=1000, help="Ignored node_modules files to generate.")
    parser.add_argument("--max-seconds", type=float, default=180.0, help="Budget for this benchmark run.")
    parser.add_argument("--shallow", action="store_true", help="Benchmark the shallow file-inventory first pass.")
    parser.add_argument("--verbose", action="store_true", help="Keep application logs during the benchmark.")
    args = parser.parse_args()

    if not args.verbose:
        logger.remove()

    result = run_fast_index_benchmark(
        workdir=args.workdir,
        files=args.files,
        symbols_per_file=args.symbols_per_file,
        pruned_files=args.pruned_files,
        max_seconds=args.max_seconds,
        shallow=args.shallow,
    )
    print(benchmark_result_json(result))
    return 0 if result["under_budget"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
