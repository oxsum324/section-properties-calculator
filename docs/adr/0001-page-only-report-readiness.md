# Separate page diagnostics from calculation-book approval

The tools may show engineering readiness, control-flow explanations, warnings, and priority reading status on the work page or homepage, but those diagnostic details must not be copied into calculation books, printed output, PDFs, Word reports, or workbook exports. They help internal review and triage; the calculation attachment itself contains adopted engineering inputs, assumptions, code references, calculations, results, conclusions, completed review provenance, and output traceability.

Engineering status and document identity are independent. Failed checks and pending manual review remain visible as calculation results, but they do not make the document a DRAFT or prevent printing. Every newly generated calculation book defaults to the concise state `文件狀態：內部審閱`. The user may explicitly select `本計算內容已完成審閱，核可作為正式附件`; the output then becomes `文件狀態：正式附件` and records the approval time and calculation fingerprint. Approval identifies the document and does not claim that an NG engineering result is acceptable.

Project name, project number, and designer are optional attachment identity fields. Blank values are omitted rather than treated as failure because the enclosing main report or attachment package may supply them. Changing a calculation input invalidates a prior approval and returns the next output to internal review.

Shared renderers enforce this rule consistently. Work-page direct printing remains blocked and must never be confused with either calculation-book state; both internal-review and formal-attachment documents are printable only through the calculation-book action.
