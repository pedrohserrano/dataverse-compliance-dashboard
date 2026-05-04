#!/usr/bin/env python3
"""Export allowlisted service-contact occurrences for manual auditing."""

from __future__ import annotations

import csv
import json
import sys
from pathlib import Path
from typing import Any

APPROVED_UM_SERVICE_CONTACT_LABELS = {
    "data management law",
    "data steward sbe",
    "datamanagement fpn",
    "dataverse support contact",
    "dataversenl team",
    "dataversenl um contact",
    "dataversenl um-ul team",
    "faculty data manager",
    "faculty data manager fpn",
    "fasos data steward",
    "icis office",
    "law and tech lab",
    "law faculty data management services",
    "law rdm support",
    "rdm services",
    "rdm sevices",
    "rdm support fasos",
    "rdm support law",
    "rdm-roa",
    "rdm-sbe",
    "sbe faculty data steward",
    "sbe rdm",
    "sbe research data management",
    "sbe research data management (maastricht university)",
    "shedata",
    "ub dataverse",
    "ub dataverse support",
    "um admin",
    "um dataverse admin",
    "um dataverse support",
    "um dataversenl",
}


def read_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def normalize_payload(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]
    if isinstance(payload, dict) and isinstance(payload.get("datasets"), list):
        return [item for item in payload["datasets"] if isinstance(item, dict)]
    raise ValueError("Expected an array or a top-level datasets list.")


def normalize_label(value: Any) -> str:
    return " ".join(str(value or "").strip().lower().split())


def contact_names(dataset: dict[str, Any]) -> list[str]:
    names: list[str] = []
    for contact in dataset.get("contacts") or []:
        if isinstance(contact, str):
            names.append(contact)
        elif isinstance(contact, dict):
            name = str(contact.get("name") or "").strip()
            if name:
                names.append(name)
    return names


def main(argv: list[str]) -> int:
    input_path = Path(argv[1]) if len(argv) > 1 else Path("data/datasets.json")
    output_path = Path(argv[2]) if len(argv) > 2 else Path("data/service_contact_allowlist_audit.csv")
    datasets = normalize_payload(read_json(input_path))

    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8", newline="") as handle:
        writer = csv.DictWriter(
            handle,
            fieldnames=[
                "contact_label",
                "persistent_id",
            ],
        )
        writer.writeheader()
        rows_written = 0
        for dataset in datasets:
            for contact_label in contact_names(dataset):
                normalized_contact_label = normalize_label(contact_label)
                if normalized_contact_label not in APPROVED_UM_SERVICE_CONTACT_LABELS:
                    continue
                writer.writerow(
                    {
                        "contact_label": contact_label,
                        "persistent_id": dataset.get("persistent_id", ""),
                    }
                )
                rows_written += 1

    print(f"Rows written: {rows_written}")
    print(f"Output: {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
