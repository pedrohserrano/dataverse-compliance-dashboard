#!/usr/bin/env python3
"""Diagnose dataset-count discrepancies for the dashboard JSON."""

from __future__ import annotations

import json
import sys
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any

MAASTRICHT_TOP_LEVELS = {
    "Faculty of Psychology and Neuroscience",
    "School of Business and Economics",
    "Faculty of Health, Medicine & Life Sciences",
    "Faculty of Arts and Social Sciences",
    "Faculty of Law",
    "Faculty of Science and Engineering",
    "UNU-MERIT",
    "DataHub",
    "Maastricht UMC+",
    "Zuyderland",
    "University Library",
}


def read_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def normalize_payload(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]
    if isinstance(payload, dict) and isinstance(payload.get("datasets"), list):
        return [item for item in payload["datasets"] if isinstance(item, dict)]
    raise ValueError("Expected data/datasets.json to contain an array or a top-level datasets list.")


def normalize_text(value: Any) -> str:
    return str(value or "").strip().lower()


def normalize_bool(value: Any) -> bool | None:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    if isinstance(value, str):
        normalized = normalize_text(value)
        if normalized in {"true", "1", "yes", "released"}:
            return True
        if normalized in {"false", "0", "no", "draft"}:
            return False
    return None


def publication_state(record: dict[str, Any]) -> str:
    for field in (
        "publication_status",
        "publicationStatus",
        "versionState",
        "version_state",
        "latest_version_publishing_state",
        "latestVersionPublishingState",
    ):
        value = record.get(field)
        if value not in (None, ""):
            return str(value)

    for field in ("published", "isReleased"):
        value = normalize_bool(record.get(field))
        if value is True:
            return "RELEASED"
        if value is False:
            return "DRAFT"

    return "UNKNOWN"


def record_identifier(record: dict[str, Any]) -> str:
    return str(record.get("persistent_id") or record.get("persistentId") or record.get("dataset_id") or "").strip()


def object_type(record: dict[str, Any]) -> str:
    return str(record.get("object_type") or record.get("type") or "unknown").strip() or "unknown"


def hierarchy_path(record: dict[str, Any]) -> list[str]:
    raw = (
        record.get("subdataverse_path")
        or record.get("dataverse_path")
        or record.get("subdataversePath")
        or record.get("hierarchy")
        or record.get("path")
        or []
    )
    if isinstance(raw, str):
        parts = [part.strip() for part in raw.split("/") if part.strip()]
        return parts
    if isinstance(raw, list):
        return [str(part).strip() for part in raw if str(part).strip()]
    return []


def within_maastricht(record: dict[str, Any]) -> bool:
    top_level = str(record.get("top_level_dataverse") or "").strip()
    if top_level:
        return top_level in MAASTRICHT_TOP_LEVELS

    path = hierarchy_path(record)
    if path:
        first = path[0]
        return first in MAASTRICHT_TOP_LEVELS or first == "Maastricht University"

    return False


def is_published(record: dict[str, Any]) -> bool:
    state = normalize_text(publication_state(record))
    if state in {"released", "published"}:
        return True

    for field in ("published", "isReleased"):
        value = normalize_bool(record.get(field))
        if value is not None:
            return value

    return False


def is_harvested(record: dict[str, Any]) -> bool | None:
    for field in ("harvested", "isHarvested"):
        value = normalize_bool(record.get(field))
        if value is not None:
            return value
    return None


def choose_unique_published(records: list[dict[str, Any]]) -> list[dict[str, Any]]:
    groups: dict[str, list[dict[str, Any]]] = defaultdict(list)
    for record in records:
        key = record_identifier(record)
        if key:
            groups[key].append(record)

    chosen: list[dict[str, Any]] = []
    for key, group in groups.items():
        if not key:
            continue
        published = [record for record in group if is_published(record)]
        preferred = published or group
        chosen.append(preferred[0])
    return chosen


def main(argv: list[str]) -> int:
    input_path = Path(argv[1]) if len(argv) > 1 else Path("data/datasets.json")
    records = normalize_payload(read_json(input_path))

    type_counts = Counter(object_type(record) for record in records)
    pid_counts = Counter(
        str(record.get("persistent_id") or record.get("persistentId") or "").strip()
        for record in records
        if str(record.get("persistent_id") or record.get("persistentId") or "").strip()
    )
    dataset_id_counts = Counter(
        str(record.get("dataset_id") or "").strip() for record in records if str(record.get("dataset_id") or "").strip()
    )
    publication_counts = Counter(publication_state(record) for record in records)
    top_level_counts = Counter(str(record.get("top_level_dataverse") or "(missing)").strip() or "(missing)" for record in records)
    outside_maastricht = [record for record in records if not within_maastricht(record)]
    harvested_values = [is_harvested(record) for record in records]
    harvested_true = sum(1 for value in harvested_values if value is True)
    harvested_known = any(value is not None for value in harvested_values)

    dataset_only = [record for record in records if object_type(record).lower() == "dataset"]
    published_only = [record for record in dataset_only if is_published(record)]
    maastricht_only = [record for record in published_only if within_maastricht(record)]
    non_harvested = [record for record in maastricht_only if is_harvested(record) is not True]
    final_records = choose_unique_published(non_harvested)

    print(f"1. Total records in data/datasets.json: {len(records)}")
    print(f"2. Count where type/object_type is dataset: {len(dataset_only)}")
    print(f"3. Count of unique persistent_id: {len(pid_counts)}")
    print(f"4. Count of unique dataset_id: {len(dataset_id_counts)}")
    print("5. Count by publication state fields:")
    for label, count in publication_counts.most_common():
        print(f"   - {label}: {count}")
    duplicate_pid_values = sum(1 for count in pid_counts.values() if count > 1)
    print(f"6. Count of duplicate persistent_id values: {duplicate_pid_values}")
    print("7. Count by top-level dataverse path:")
    for label, count in top_level_counts.most_common():
        print(f"   - {label}: {count}")
    print(f"8. Count outside Maastricht hierarchy: {len(outside_maastricht)}")
    if harvested_known:
        print(f"9. Count with harvested == true: {harvested_true}")
    else:
        print("9. Count with harvested == true: field not present in normalized data")
    print(f"10. Final count after filtering to unique published datasets in Maastricht hierarchy: {len(final_records)}")

    if not dataset_id_counts:
        print("WARNING: dataset_id is missing from normalized data; persistent_id is the only unique key currently available.")
    if "UNKNOWN" in publication_counts:
        print("WARNING: some records have no explicit publication-state field; they are excluded from the final published count.")
    if any(str(record.get('top_level_dataverse') or '').strip() == '' for record in records):
        print("WARNING: some records have no top_level_dataverse; they are excluded from the Maastricht hierarchy count.")

    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
