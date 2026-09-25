# git filter-repo --file-info-callback body (pass 2 of history-rewrite-runbook.md).
# Turns every add or modify of a blob listed in $DROP_BLOBS into a deletion, so
# the flagged versions of a path leave history and its clean versions stay.
import os
if "drop" not in value.data:
    with open(os.environ["DROP_BLOBS"], "rb") as fh:
        value.data["drop"] = set(line.strip() for line in fh if line.strip() and not line.startswith(b"#"))
if blob_id in value.data["drop"]:
    return (filename, None, blob_id)
return (filename, mode, blob_id)
