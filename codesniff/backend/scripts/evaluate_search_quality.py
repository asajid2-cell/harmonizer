"""Evaluate CodeSniff cold search quality against golden queries."""

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.search_quality import (
    attach_search_quality_baseline,
    evaluate_repo_search_smoke,
    evaluate_search_quality,
    load_golden_query_suite,
)


def _threshold_baseline(args) -> dict:
    baseline = {}
    if args.min_recall is not None:
        baseline["min_recall_at_k"] = args.min_recall
    if args.min_mrr is not None:
        baseline["min_mrr"] = args.min_mrr
    if args.min_passed is not None:
        baseline["min_passed"] = args.min_passed
    return baseline


def _baseline_for_report(report: dict, suite_baseline: dict | None, args) -> dict | None:
    cli_baseline = _threshold_baseline(args)
    if suite_baseline:
        merged = dict(suite_baseline)
        merged.update(cli_baseline)
        return merged
    if cli_baseline:
        return cli_baseline
    if report.get("baseline"):
        return None
    return {"min_recall_at_k": 1.0, "min_mrr": 0.0}


def _passed(report: dict) -> bool:
    baseline = report.get("baseline")
    if isinstance(baseline, dict):
        return bool(baseline.get("met"))
    return True


def main() -> int:
    parser = argparse.ArgumentParser(description="Evaluate cold repo search against golden queries")
    parser.add_argument("repo", help="Path to repo.sqlite or a repo artifact directory containing repo.sqlite")
    parser.add_argument(
        "golden_queries",
        nargs="?",
        help=(
            "JSON file with golden queries. Omit when repo points to an artifact directory "
            "to evaluate its cached repo-owned suite or generated smoke cases."
        ),
    )
    parser.add_argument("--limit", type=int, default=20, help="Search result limit per query")
    parser.add_argument("--max-cases", type=int, default=40, help="Maximum repo-owned/generated cases when no golden file is provided")
    parser.add_argument("--top-k", type=int, default=5, help="Top-k for repo-owned/generated cases when no golden file is provided")
    parser.add_argument("--min-recall", type=float, default=None, help="Override required recall_at_k threshold")
    parser.add_argument("--min-mrr", type=float, default=None, help="Override required mean reciprocal rank threshold")
    parser.add_argument("--min-passed", type=int, default=None, help="Override required number of passing cases")
    parser.add_argument("--json", action="store_true", help="Print machine-readable JSON only")
    args = parser.parse_args()

    repo_path = Path(args.repo)
    suite_baseline = None
    if args.golden_queries:
        repo_db = repo_path / "repo.sqlite" if repo_path.is_dir() else repo_path
        cases, suite_baseline = load_golden_query_suite(args.golden_queries)
        report = evaluate_search_quality(repo_db, cases, limit=args.limit)
    else:
        if not repo_path.is_dir():
            parser.error("golden_queries is required when repo is a direct repo.sqlite path")
        report = evaluate_repo_search_smoke(repo_path, max_cases=args.max_cases, top_k=args.top_k)

    threshold_baseline = _baseline_for_report(report, suite_baseline, args)
    if threshold_baseline is not None:
        attach_search_quality_baseline(report, threshold_baseline)
    passed = _passed(report)

    if args.json:
        print(json.dumps({**report, "passed_thresholds": passed}, indent=2, sort_keys=True))
    else:
        print(
            f"queries={report['total']} passed={report['passed']} failed={report['failed']} "
            f"recall_at_k={report['recall_at_k']:.3f} mrr={report['mrr']:.3f}"
        )
        baseline = report.get("baseline")
        if isinstance(baseline, dict):
            status = "PASS" if baseline.get("met") else "FAIL"
            parts = []
            if baseline.get("min_recall_at_k") is not None:
                parts.append(f"recall>={baseline['min_recall_at_k']:.3f} delta={baseline.get('recall_delta', 0):.3f}")
            if baseline.get("min_mrr") is not None:
                parts.append(f"mrr>={baseline['min_mrr']:.3f} delta={baseline.get('mrr_delta', 0):.3f}")
            if baseline.get("min_passed") is not None:
                parts.append(f"passed>={baseline['min_passed']} delta={baseline.get('passed_delta', 0)}")
            print(f"baseline={status} {' '.join(parts)}")
        for warning in report.get("warnings", []):
            print(f"WARN {warning}")
        for item in report["results"]:
            status = "PASS" if item["passed"] else "FAIL"
            rank = item["rank"] if item["rank"] is not None else "-"
            print(f"{status} rank={rank} top_k={item['top_k']} query={item['query']}")
            if not item["passed"]:
                for result in item["top_results"][:3]:
                    print(f"  {result['rank']}. {result['symbol']} {result['path']} score={result['score']:.3f}")

    return 0 if passed else 1


if __name__ == "__main__":
    sys.exit(main())
