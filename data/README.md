### Data

- Normalized JSON used by the static dashboard
- Input is `datasets.json`, loaded by the browser application for the plots and table views.
- The `raw/` subfolder is intended for crawler exports before transformation. 
- The dashboard should not depend directly on raw crawler output; instead, use the helper workflow described in `../scripts/README.md` to convert raw metadata into dashboard-ready JSON. 

> No secrets, tokens, or credentials should be stored in this folder.
