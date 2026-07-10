---
status: accepted
---

# Use formal steel pages for new-project calculation attachments

New-project formal steel calculation attachments must be produced from the formal steel pages. The legacy steel beam and column pages remain transition tools for existing-project continuity and controlled continuous-beam imports, but their output is not eligible as a new-project formal calculation attachment; this keeps one governed report path without breaking established project workflows.

Legacy steel pages must label their output as `舊案延續計算記錄` and require explicit confirmation that the current use belongs to an existing project before producing it. This label records the delivery classification of the output; it is not report-readiness status and therefore does not alter the page-only boundary established by ADR-0001.

Continuous-beam analysis may transfer candidate actions to the formal steel beam page, but it must not offer a steel-column transfer. A continuous-beam model does not provide the axial force, biaxial action, effective-length factors, or frame context required for a formal steel-column check; a future column transfer must come from an analysis workflow that owns that information, such as frame analysis.

Transferred continuous-beam data must first appear in a page-only candidate-input review area and must not immediately overwrite formal design inputs or run a check. The designer must review the positive and negative moment envelopes, shear, span, load basis, units, section, material strength, and stability parameters before applying values; the formal calculation book records only the adopted inputs and their engineering source, never the candidate-review status.
