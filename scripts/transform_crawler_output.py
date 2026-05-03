#!/usr/bin/env python3
"""Transform raw Dataverse crawler output into data/datasets.json.

This script is intentionally defensive because the exact crawler JSON structure
may vary by version or invocation.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path
from typing import Any

PRODUCTION_BASE_URL = "https://dataverse.nl"
ROOT_DATAVERSE_NAME = "Maastricht University"
IGNORED_DATAVERSE_SEGMENTS = {"root", ROOT_DATAVERSE_NAME, "UB-UM"}
FACULTY_MAPPING = {
    "Faculty of Psychology and Neuroscience": "FPN",
    "School of Business and Economics": "SBE",
    "Faculty of Health, Medicine & Life Sciences": "FHML",
    "Faculty of Arts and Social Sciences": "FASoS",
    "Faculty of Law": "FdR",
    "Faculty of Science and Engineering": "FSE",
    "UNU-MERIT": "UNU-MERIT",
    "DataHub": "MUMC+",
    "Maastricht UMC+": "MUMC+",
    "Zuyderland": "MUMC+",
}


def read_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def write_json(path: Path, data: Any) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as handle:
        json.dump(data, handle, indent=2, ensure_ascii=False)
        handle.write("\n")


def get_nested(data: Any, path: str, default: Any = None) -> Any:
    current = data
    for part in path.split("."):
        if isinstance(current, dict) and part in current:
            current = current[part]
        else:
            return default
    return current


def first_present(data: dict[str, Any], *paths: str) -> Any:
    for path in paths:
        value = get_nested(data, path, None)
        if value not in (None, "", [], {}):
            return value
    return None


def as_string(value: Any) -> str:
    if value is None:
        return ""
    if isinstance(value, str):
        return value.strip()
    return str(value).strip()


def as_bool(value: Any) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        return bool(value)
    if isinstance(value, str):
        return value.strip().lower() in {"true", "1", "yes", "restricted"}
    return False


def ensure_list(value: Any) -> list[Any]:
    if value is None:
        return []
    if isinstance(value, list):
        return value
    return [value]


def normalize_path_list(value: Any) -> list[str]:
    if isinstance(value, list):
        return [as_string(item) for item in value if as_string(item)]
    if isinstance(value, str):
        parts = [segment.strip() for segment in value.split("/") if segment.strip()]
        return parts
    return []


def normalize_dataverse_segment(value: Any) -> str:
    return as_string(value)


def should_ignore_dataverse_segment(segment: str) -> bool:
    normalized = normalize_dataverse_segment(segment)
    return normalized in IGNORED_DATAVERSE_SEGMENTS


def clean_subdataverse_path(path: list[str]) -> list[str]:
    return [segment for segment in path if segment and not should_ignore_dataverse_segment(segment)]


def map_subdataverse_path(path: list[str]) -> dict[str, Any]:
    meaningful = clean_subdataverse_path(path)
    first_level = meaningful[0] if len(meaningful) >= 1 else ""
    second_level = meaningful[1] if len(meaningful) >= 2 else ""
    depth = len(meaningful)

    return {
        "faculty_or_org": FACULTY_MAPPING.get(first_level, first_level),
        "department_or_project": second_level,
        "top_level_dataverse": first_level,
        "second_level_dataverse": second_level,
        "subdataverse_depth": depth,
    }


def persistent_id_from_record(record: dict[str, Any]) -> str:
    direct = as_string(
        first_present(
            record,
            "persistent_id",
            "persistentId",
            "global_id",
            "globalId",
            "doi",
            "data.datasetPersistentId",
            "path_info.datasetPersistentId",
        )
    )
    if direct:
        return direct

    protocol = as_string(record.get("protocol"))
    authority = as_string(record.get("authority"))
    identifier = as_string(record.get("identifier"))
    if protocol and authority and identifier:
        separator = as_string(record.get("separator")) or "/"
        return f"{protocol}:{authority}{separator}{identifier}"

    persistent_url = as_string(record.get("persistentUrl"))
    if persistent_url.startswith("https://doi.org/"):
        return f"doi:{persistent_url.removeprefix('https://doi.org/')}"

    return ""


def published_content_records(payload: dict[str, Any]) -> list[dict[str, Any]]:
    contents = payload.get("dataverse_contents")
    if not isinstance(contents, dict):
        return []

    records: list[dict[str, Any]] = []
    for response in contents.values():
        data = response.get("data") if isinstance(response, dict) else None
        if not isinstance(data, list):
            continue
        for item in data:
            if (
                isinstance(item, dict)
                and item.get("type") == "dataset"
                and item.get("publicationDate")
                and item.get("persistentUrl")
            ):
                records.append(item)

    return records


def extract_dataset_records(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return [item for item in payload if isinstance(item, dict)]

    if isinstance(payload, dict):
        if payload and all(
            isinstance(item, dict) and ("data" in item or "path_info" in item)
            for item in payload.values()
        ):
            return [item for item in payload.values() if isinstance(item, dict)]

        datasets = payload.get("datasets")
        if isinstance(datasets, dict):
            records = [item for item in datasets.values() if isinstance(item, dict)]
            seen = {persistent_id_from_record(item) for item in records}
            records.extend(
                item
                for item in published_content_records(payload)
                if persistent_id_from_record(item) not in seen
            )
            return records
        if isinstance(datasets, list):
            records = [item for item in datasets if isinstance(item, dict)]
            seen = {persistent_id_from_record(item) for item in records}
            records.extend(
                item
                for item in published_content_records(payload)
                if persistent_id_from_record(item) not in seen
            )
            return records

    raise ValueError(
        "Could not locate dataset records in the raw JSON. "
        "Inspect the crawler output and adjust extract_dataset_records()."
    )


def extract_authors(record: dict[str, Any]) -> list[dict[str, str]]:
    raw_authors = first_present(
        record,
        "authors",
        "metadataBlocks.citation.author",
        "metadata_blocks.citation.author",
    )
    if not raw_authors:
        raw_authors = citation_field_value(record, "author")

    authors: list[dict[str, str]] = []
    for item in ensure_list(raw_authors):
        if not isinstance(item, dict):
            name = as_string(item)
            if name:
                authors.append({"name": name, "affiliation": "", "orcid": ""})
            continue

        identifier_scheme = as_string(
            first_present(
                item,
                "authorIdentifierScheme.value",
                "authorIdentifierScheme",
                "scheme",
                "type",
            )
        ).lower()
        identifier = as_string(first_present(item, "authorIdentifier.value", "authorIdentifier", "id"))
        authors.append(
            {
                "name": as_string(
                    first_present(
                        item,
                        "authorName.value",
                        "authorName",
                        "name",
                        "value",
                        "author_name",
                    )
                ),
                "affiliation": as_string(
                    first_present(
                        item,
                        "authorAffiliation.value",
                        "authorAffiliation",
                        "affiliation",
                        "author_affiliation",
                    )
                ),
                "orcid": identifier if identifier_scheme == "orcid" else as_string(first_present(item, "orcid")),
            }
        )

    return [author for author in authors if any(author.values())]


def extract_contacts(record: dict[str, Any]) -> list[dict[str, str]]:
    raw_contacts = first_present(
        record,
        "contacts",
        "dataset_contacts",
        "metadataBlocks.citation.datasetContact",
        "metadata_blocks.citation.datasetContact",
    )
    if not raw_contacts:
        raw_contacts = citation_field_value(record, "datasetContact")
    contacts: list[dict[str, str]] = []

    for item in ensure_list(raw_contacts):
        if isinstance(item, dict):
            contacts.append(
                {
                    "name": as_string(
                        first_present(
                            item,
                            "name",
                            "datasetContactName",
                            "datasetContactName.value",
                            "contactName",
                        )
                    ),
                    "email": as_string(
                        first_present(
                            item,
                            "email",
                            "datasetContactEmail",
                            "datasetContactEmail.value",
                            "contactEmail",
                        )
                    ),
                }
            )
        else:
            email = as_string(item)
            if email:
                contacts.append({"name": "", "email": email})

    direct_email = as_string(first_present(record, "contact_email", "contactEmail"))
    if direct_email:
        contacts.append({"name": "", "email": direct_email})

    deduped: list[dict[str, str]] = []
    seen: set[tuple[str, str]] = set()
    for contact in contacts:
        key = (contact["name"], contact["email"])
        if key in seen or not (contact["name"] or contact["email"]):
            continue
        seen.add(key)
        deduped.append(contact)

    return deduped


def extract_keywords(record: dict[str, Any]) -> list[str]:
    raw_keywords = first_present(
        record,
        "keywords",
        "metadataBlocks.citation.keyword",
        "metadata_blocks.citation.keyword",
    )
    if not raw_keywords:
        raw_keywords = citation_field_value(record, "keyword")

    keywords: list[str] = []
    for item in ensure_list(raw_keywords):
        if isinstance(item, dict):
            value = as_string(first_present(item, "value", "keywordValue.value", "keywordValue", "subject"))
        else:
            value = as_string(item)
        if value:
            keywords.append(value)

    return keywords


def extract_description(record: dict[str, Any]) -> str:
    direct = as_string(first_present(record, "description", "dsDescription"))
    if direct:
        return direct

    raw_descriptions = first_present(
        record,
        "descriptions",
        "metadataBlocks.citation.dsDescription",
        "metadata_blocks.citation.dsDescription",
    )
    if not raw_descriptions:
        raw_descriptions = citation_field_value(record, "dsDescription")

    for item in ensure_list(raw_descriptions):
        if isinstance(item, dict):
            value = as_string(
                first_present(
                    item,
                    "value",
                    "dsDescriptionValue.value",
                    "dsDescriptionValue",
                    "description",
                    "text",
                )
            )
        else:
            value = as_string(item)
        if value:
            return value

    return ""


def extract_files(record: dict[str, Any]) -> list[dict[str, Any]]:
    raw_files = first_present(record, "files", "data.files", "dataFiles", "datafiles")
    files: list[dict[str, Any]] = []

    for item in ensure_list(raw_files):
        if not isinstance(item, dict):
            continue

        data_file = item.get("dataFile")
        if not isinstance(data_file, dict):
            data_file = {}

        files.append(
            {
                "label": as_string(item.get("label") or data_file.get("filename") or item.get("filename")),
                "mime_type": as_string(
                    data_file.get("contentType")
                    or item.get("contentType")
                    or item.get("mime_type")
                    or item.get("mimeType")
                ),
                "size": data_file.get("filesize")
                or item.get("filesize")
                or item.get("size")
                or item.get("contentSize"),
                "restricted": as_bool(item.get("restricted") or item.get("isRestricted")),
            }
        )

    return files


def citation_field_value(record: dict[str, Any], type_name: str) -> Any:
    fields = get_nested(record, "data.metadataBlocks.citation.fields", [])
    if not isinstance(fields, list):
        return None

    for field in fields:
        if isinstance(field, dict) and field.get("typeName") == type_name:
            return field.get("value")
    return None


def path_segments_from_record(record: dict[str, Any]) -> list[str]:
    raw_path = as_string(first_present(record, "path_info.path", "path"))
    return [segment.strip() for segment in raw_path.split("/") if segment.strip()]


def subdataverse_alias_from_record(record: dict[str, Any], context: dict[str, Any] | None) -> str:
    direct = as_string(
        first_present(record, "subdataverse_alias", "dataverse_alias", "parentDataverseAlias", "alias")
    )
    if direct:
        return direct

    if not context:
        return ""

    path_ids = first_present(record, "path_info.pathIds", "pathIds")
    if not isinstance(path_ids, list) or not path_ids:
        return ""

    flatten = context.get("collections_tree_flatten")
    if not isinstance(flatten, dict):
        return ""

    last_id = str(path_ids[-1])
    node = flatten.get(last_id) or flatten.get(path_ids[-1])
    if isinstance(node, dict):
        return as_string(node.get("alias"))
    return ""


def normalize_record(record: dict[str, Any], context: dict[str, Any] | None = None) -> dict[str, Any]:
    object_type = as_string(
        first_present(
            record,
            "object_type",
            "datasetType",
            "type",
            "data.datasetType",
            "data.type",
        )
    )
    if not object_type:
        object_type = "dataset"

    dataset_id = as_string(
        first_present(
            record,
            "dataset_id",
            "datasetId",
            "id",
            "data.datasetId",
            "data.id",
            "path_info.datasetId",
        )
    )
    title = as_string(
        first_present(
            record,
            "title",
            "name",
            "data.title",
            "metadataBlocks.citation.title",
            "metadata_blocks.citation.title",
        )
    )
    if not title:
        title = as_string(citation_field_value(record, "title"))
    persistent_id = persistent_id_from_record(record)
    if not title:
        title = persistent_id
    url = as_string(
        first_present(
            record,
            "url",
            "dataset_url",
            "landingPage",
            "landingPageUrl",
            "persistentUrl",
            "data.url",
        )
    )
    if not url and persistent_id:
        url = f"{PRODUCTION_BASE_URL}/dataset.xhtml?persistentId={persistent_id}"
    publication_date = as_string(
        first_present(
            record,
            "publication_date",
            "publicationDate",
            "published_at",
            "publication_date_utc",
            "data.publicationDate",
        )
    )
    version_state = as_string(
        first_present(
            record,
            "versionState",
            "version_state",
            "publicationStatus",
            "publication_status",
            "data.versionState",
            "data.publicationStatus",
            "data.latestVersionPublishingState",
        )
    )
    latest_version_publishing_state = as_string(
        first_present(
            record,
            "latestVersionPublishingState",
            "latest_version_publishing_state",
            "data.latestVersionPublishingState",
        )
    )
    license_value = as_string(
        first_present(
            record,
            "license",
            "license_name",
            "termsOfUse",
            "metadata.license",
            "data.license.name",
            "data.license.rightsIdentifier",
        )
    )
    access_status = as_string(first_present(record, "access_status", "accessStatus"))
    terms_of_access = as_string(
        first_present(
            record,
            "terms_of_access",
            "custom_terms",
            "restricted_access_terms",
            "access_conditions",
            "termsOfAccess",
            "data.termsOfAccess",
        )
    )

    contacts = extract_contacts(record)
    authors = extract_authors(record)
    description = extract_description(record)
    keywords = extract_keywords(record)
    files = extract_files(record)

    subdataverse_path = normalize_path_list(
        first_present(record, "subdataverse_path", "dataverse_path", "dataversePath", "path")
    )
    if not subdataverse_path:
        subdataverse_path = path_segments_from_record(record)

    subdataverse = as_string(first_present(record, "subdataverse", "dataverse_name", "parentDataverseName"))
    if not subdataverse and len(subdataverse_path) > 1:
        subdataverse = subdataverse_path[-1]

    subdataverse_alias = subdataverse_alias_from_record(record, context)
    subdataverse_path = clean_subdataverse_path(normalize_path_list(subdataverse_path))
    path_mapping = map_subdataverse_path(subdataverse_path)

    restricted = as_bool(first_present(record, "restricted", "isRestricted")) or any(
        as_bool(file_entry.get("restricted")) for file_entry in files
    )
    harvested = as_bool(
        first_present(
            record,
            "harvested",
            "isHarvested",
            "data.harvested",
            "data.isHarvested",
        )
    )
    if not access_status:
        access_status = "restricted" if restricted else "open"

    published = version_state.upper() == "RELEASED" or latest_version_publishing_state.upper() == "RELEASED"
    is_released = published

    file_count = first_present(record, "file_count", "fileCount", "files_count", "data.files")
    if file_count in (None, ""):
        file_count = len(files)
    elif isinstance(file_count, list):
        file_count = len(file_count)
    elif isinstance(file_count, str):
        try:
            file_count = int(file_count)
        except ValueError:
            file_count = len(files)

    path_parent = subdataverse_path[-1] if subdataverse_path else ""
    if path_parent:
        subdataverse = path_parent
    elif should_ignore_dataverse_segment(subdataverse):
        subdataverse = ""

    if not subdataverse and path_mapping["department_or_project"]:
        subdataverse = path_mapping["department_or_project"]
    elif not subdataverse and path_mapping["top_level_dataverse"]:
        subdataverse = path_mapping["top_level_dataverse"]

    normalized = {
        "type": object_type,
        "object_type": object_type,
        "dataset_id": dataset_id,
        "title": title,
        "persistent_id": persistent_id,
        "url": url,
        "publication_date": publication_date,
        "version_state": version_state,
        "latest_version_publishing_state": latest_version_publishing_state,
        "published": published,
        "isReleased": is_released,
        "harvested": harvested,
        "license": license_value,
        "access_status": access_status,
        "restricted": restricted,
        "terms_of_access": terms_of_access,
        "contacts": contacts,
        "authors": authors,
        "description": description,
        "keywords": keywords,
        "subdataverse": subdataverse,
        "subdataverse_alias": subdataverse_alias,
        "subdataverse_path": subdataverse_path,
        "faculty_or_org": path_mapping["faculty_or_org"],
        "department_or_project": path_mapping["department_or_project"],
        "top_level_dataverse": path_mapping["top_level_dataverse"],
        "second_level_dataverse": path_mapping["second_level_dataverse"],
        "subdataverse_depth": path_mapping["subdataverse_depth"],
        "file_count": int(file_count) if isinstance(file_count, (int, float)) else len(files),
        "files": files,
    }

    return normalized


def print_summary(datasets: list[dict[str, Any]]) -> None:
    missing_license = sum(1 for item in datasets if not item["license"])
    missing_contacts = sum(1 for item in datasets if not item["contacts"])

    print(f"Datasets written: {len(datasets)}")
    print(f"Missing license: {missing_license}")
    print(f"Missing contacts: {missing_contacts}")


def main(argv: list[str]) -> int:
    if len(argv) < 2 or len(argv) > 3:
        print(
            "Usage: python scripts/transform_crawler_output.py "
            "data/raw/<raw-file>.json [data/datasets.json]"
        )
        return 1

    input_path = Path(argv[1])
    output_path = Path(argv[2]) if len(argv) == 3 else Path("data/datasets.json")

    payload = read_json(input_path)
    records = extract_dataset_records(payload)
    datasets = [normalize_record(record, payload if isinstance(payload, dict) else None) for record in records]
    write_json(output_path, datasets)
    print_summary(datasets)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv))
