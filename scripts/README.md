# Scripts

This folder contains helper scripts for local extraction and transformation workflows. They are for local or administrative use, not for browser execution, and convert raw metadata crawler output into the normalized JSON used by the dashboard.

Some workflows may use a local `TOKEN.txt` file in the repository root when access to the Dataverse API is needed, but that file must remain git-ignored. The static dashboard itself does not need Python at runtime. For count checks, `diagnose_dataset_counts.py` reports how many normalized records are datasets, how many are published, whether duplicates exist, and the final unique published Maastricht dataset total.
