---
status: accepted
---

# Require rendered delivery evidence for release

A formal release must include evidence from actual rendered delivery artifacts, not only source contracts or generated HTML text. Every formal tool must produce at least one real artifact for verification, and every supported detailed or summary layout of a shared report engine must have a representative render case; PDF checks cover page count, readable text, nonblank content, clipping, table headings, reading order, and page-only wording exclusion, while DOCX and workbook checks extract their paragraph, table, or cell text. The additional release time is accepted because a source-level pass cannot prove that the calculation attachment received by a reviewer is usable.

The page-only report-readiness overview may publish aggregate completion counts, covered families, the release runId, a repository-relative evidence path, and its hash. It must not publish artifact filenames, project content, local absolute paths, or the page-only overview itself inside any calculation attachment.
