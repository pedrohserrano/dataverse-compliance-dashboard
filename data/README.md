# Data

This folder contains the normalized JSON used by the static dashboard. The main input is `datasets.json`, which is loaded by the browser application for the cards, charts, filters, and table views.

The `raw/` subfolder is intended for crawler exports before transformation. The dashboard should not depend directly on raw crawler output; instead, use the helper workflow described in `../scripts/README.md` to convert raw metadata into dashboard-ready JSON. No secrets, tokens, or credentials should be stored in this folder.
