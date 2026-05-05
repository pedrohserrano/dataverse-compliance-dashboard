# DataverseNL Metadata Compliance Dashboard 📊

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
![Static Site](https://img.shields.io/badge/Static-HTML-orange.svg)

This dashboard monitors compliance with selected metadata requirements derived from the UM DataverseNL Operational Guidelines, using the metadata items available in Dataverse records.

![Dashboard screen recording](assets/dashboard.gif)

## How the metadata requirements are assessed ✅

1. CC-BY licence for non restricted data → Based on guideline point 12.1.
   For the current implementation, this requirement is assessed by checking that the dataset has a non-empty licence other than CC0-1.0.
2. Custom terms for restricted data → Based on guideline points 12.2–12.3.
3. UM service contact is present → Based on guideline point 12.5.
   Because the crawler export does not expose dataset contact emails, this requirement is assessed from approved service-contact labels in the dataset contact metadata. Current labels are: `Data Management Law`, `Data steward SBE`, `Datamanagement FPN`, `Dataverse Support Contact`, `DataverseNL Team`, `DataverseNL UM contact`, `DataverseNL UM-UL team`, `Faculty Data Manager`, `Faculty Data Manager FPN`, `FASoS Data Steward`, `ICIS office`, `Law and Tech Lab`, `Law Faculty Data Management Services`, `LAW RDM support`, `RDM Services`, `RDM Sevices`, `RDM support FASoS`, `RDM support LAW`, `rdm-roa`, `rdm-sbe`, `SBE Faculty Data Steward`, `SBE RDM`, `SBE Research Data Management`, `SBE Research Data Management (Maastricht University)`, `Shedata`, `UB Dataverse`, `UB Dataverse support`, `UM Admin`, `UM Dataverse Admin`, `UM Dataverse Support`, and `UM DataverseNL`.
4. At least one author has an ORCID → It is required for discoverability and be programmatically linked to the [CRIS system](https://cris.maastrichtuniversity.nl/) for research outputs at UM.
5. Description is present → Based on section 9 of the guidelines.
6. Keywords are present → Based on section 9 of the guidelines.

The six monitored requirements are:

- CC-BY licence for non restricted data
- Custom terms for restricted data
- UM service contact is present
- At least one author has an ORCID
- Description is present
- Keywords are present

The `Meeting Most Requirements` gauge shows the share of datasets meeting more than 4 requirements. The `Meeting Least Requirements` gauge shows the share of datasets meeting fewer than 2 requirements.

[View the UM DataverseNL Operational Guidelines](https://documents.library.maastrichtuniversity.nl/S/759ea4c8-1b80-4e41-8636-731cea321382)

## Data source and architecture 🧩

The browser app does not query Dataverse live. It reads the latest normalized dashboard import prepared by the background metadata workflow. When running on `localhost` or `127.0.0.1`, the app falls back to `data/datasets.json` for local development.

Raw metadata is gathered from [UM Dataverse instance](https://dataverse.nl/dataverse/maastricht>) using [scholarsportal/dataverse-metadata-crawler](https://github.com/scholarsportal/dataverse-metadata-crawler). Raw crawler exports can be placed in the local, git-ignored `data/raw/` directory, and the transformation scripts in `scripts/` convert that output into dashboard-ready JSON for the dashboard import. No API token is exposed to the browser; if a token is used locally, it should live in `TOKEN.txt`, which must remain git-ignored.

The service-contact allowlist audit can be exported locally as a two-column CSV with `contact_label` and `persistent_id`. The generated CSV is in the git-ignored `data/` directory. Regenerate it after refreshing local normalized data with:

```bash
python3 scripts/export_service_contact_audit.py data/datasets.json data/service_contact_allowlist_audit.csv
```

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

If you use this software in research, please cite the repository metadata in [CITATION.cff](https://github.com/MaastrichtU-Library/dataverse-compliance-dashboard/CITATION.cff).

## Acknowledgements 🙌

This dashboard builds on examples and tools from the wider open-science community. One useful reference for visualising Dataverse metadata compliance indicators is the [Dataverse dashboard](https://bioversity.github.io/dataverse-dashboard-curation/dataverse/dashboard.html) associated with the [Alliance Bioversity International and CIAT](https://alliancebioversityciat.org/) and the [bioversity](https://github.com/bioversity) GitHub organisation.

For metadata gathering, this project uses [scholarsportal/dataverse-metadata-crawler](https://github.com/scholarsportal/dataverse-metadata-crawler), maintained by [Scholars Portal](https://github.com/scholarsportal), a service of the Ontario Council of University Libraries, and developed by [Ken Lui](https://github.com/kenlhlui) 👍🏼.

[DataverseNL](https://dataverse.nl/) is a consortium service supported by [DANS](https://dans.knaw.nl/en/about/). This dashboard is developed independently by Maastricht University Library and does not imply endorsement by DANS or the other projects acknowledged above.

## Maintenance

Maintainer / author: [Pedro V Hernandez Serrano](https://github.com/pedrohserrano)  
Contact UM Dataverse: <ub-dataverse@maastrichtuniversity.nl>  
Released under [MIT License](LICENSE)  
© 2026 Maastricht University Library | [UM Disclaimer](https://www.maastrichtuniversity.nl/disclaimer)
