# DataverseNL Compliance Check Dashboard 📊

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
![Static Site](https://img.shields.io/badge/Static-HTML-orange.svg)
![GitHub Pages Ready](https://img.shields.io/badge/Hosting-GitHub%20Pages%20Ready-brightgreen.svg)

A static dashboard for monitoring selected metadata compliance checks in a Maastricht University DataverseNL collection.

This dashboard provides an overview of selected metadata attributes. It checks whether local rules from the UM DataverseNL Operational Guidelines are present (or absent) in the available metadata records.

Total Datasets means: unique published datasets within the Maastricht University DataverseNL hierarchy.

## Metadata checks currently included in this dashboard ✅

1. Default licence should be CC BY 4.0 → Based on guideline point 12.1.
   For the current implementation, this check passes when a dataset has a non-empty licence other than CC0-1.0.
2. Restricted data should include custom terms → Based on guideline points 12.2–12.3.
3. UM service contact should be present → Based on guideline point 12.5.
   Accepted service contacts currently include: `ub-dataverse@maastrichtuniversity.nl`, `rdm-services@maastrichtuniversity.nl`, `datamanagement-fpn@maastrichtuniversity.nl`, `rdm-fasos@maastrichtuniversity.nl`, `rdm-sbe@maastrichtuniversity.nl`, `rdm-roa@maastrichtuniversity.nl`.
4. At least one author should have an ORCID → It is required for discoverability and be programmatically linked to the [CRIS system](https://cris.maastrichtuniversity.nl/) for research outputs at UM.
5. Description and keywords should be present → Based on guideline points 9, 9.1 and 9.3.

[View the UM DataverseNL Operational Guidelines](https://documents.library.maastrichtuniversity.nl/S/759ea4c8-1b80-4e41-8636-731cea321382)

## Data source & software architecture 🧩

The browser app does not query Dataverse live. It reads normalized static JSON from the repository, currently [data/datasets.json](/Users/pedrohserrano/dataverse-compliance-dashboard/data/datasets.json), and renders summary cards, gauges, charts, filters, and the dataset table entirely client-side around checks passed, compliance coverage, and metadata attributes to check.

Raw metadata is gathered externally from <https://dataverse.nl/dataverse/maastricht> using [`scholarsportal/dataverse-metadata-crawler`](https://github.com/scholarsportal/dataverse-metadata-crawler). Raw crawler exports should be placed in `data/raw/`, and the transformation scripts in `scripts/` convert that output into dashboard-ready JSON. No API token is exposed to the browser; if a token is used locally, it should live in `TOKEN.txt`, which must remain git-ignored.

The workflow is kept separate:

```text
Dataverse API / crawler export
        ↓
raw metadata in data/raw/
        ↓
scripts/transform_crawler_output.py
        ↓
normalized data/datasets.json
        ↓
static dashboard on GitHub Pages
```

## Running locally 🚀

Clone the repository and serve it as a small static site:

```bash
git clone https://github.com/MaastrichtU-Library/dataverse-compliance-dashboard.git
cd dataverse-compliance-dashboard
python -m http.server 8000
```

Then open `http://localhost:8000`.

## Citation 📚

If you use this software in research, please cite the repository metadata in [CITATION.cff](/Users/pedrohserrano/dataverse-compliance-dashboard/CITATION.cff).

## Acknowledgements 🙌

This dashboard builds on examples and tools from the wider open-science community. One useful reference for visualising Dataverse metadata checks is the [Dataverse dashboard](https://bioversity.github.io/dataverse-dashboard-curation/dataverse/dashboard.html) associated with the [Alliance Bioversity International and CIAT](https://alliancebioversityciat.org/) and the [bioversity](https://github.com/bioversity) GitHub organisation.

For metadata gathering, this project uses [`scholarsportal/dataverse-metadata-crawler`](https://github.com/scholarsportal/dataverse-metadata-crawler), maintained by [Scholars Portal](https://github.com/scholarsportal), a service of the Ontario Council of University Libraries, and developed by [Ken Lui](https://github.com/kenlhlui).

[DataverseNL](https://dataverse.nl/) is a consortium service supported by [DANS](https://dans.knaw.nl/en/about/). This dashboard is developed independently by Maastricht University Library and does not imply endorsement by DANS or the other projects acknowledged above.

## Maintenance

Maintainer / author: [Pedro V Hernandez Serrano](https://github.com/pedrohserrano)  
Contact UM Dataverse: <ub-dataverse@maastrichtuniversity.nl>  
Released under [MIT License](LICENSE)  
© 2026 Maastricht University Library | [UM Disclaimer](https://www.maastrichtuniversity.nl/disclaimer)
