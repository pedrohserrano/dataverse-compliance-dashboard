### Scripts

- Helper scripts for local extraction and transformation workflows. 
- The dashboard is independed to these workflows
- Some workflows may use a local `TOKEN.txt` file (git ignored) in the repository root when access to the Dataverse API is needed.
- The static dashboard itself does not need Python at runtime.
- For dataset-count diagnostics, `diagnose_dataset_counts.py` reports how many normalized records are datasets, how many are published, whether duplicates exist, and the final unique published Maastricht dataset total.
