---
status: accepted
---

# Keep calculation books calculation-first

Calculation books must present adopted engineering inputs, source and version trace, equations, substitutions, calculated results, code references attached to the relevant calculation, and the final engineering conclusion. The conclusion follows the calculation content.

Input-mode guidance, report-mode labels, unit-switching explanations, screen navigation, reading priority, output settings, interface highlight cards, glossary teaching, and long clause explanations are page-only material. They may remain visible in the HTML work page but must not appear as calculation-book cover cards, report sections, printed output, or PDF content.

This boundary does not remove engineering basis from the calculation book. A clause number, adopted assumption, scope limitation, failed check, or completed manual-review record remains when necessary to understand the calculation; it is written next to the affected input, equation, result, or conclusion. Document identity is limited to a compact footer: `文件狀態：內部審閱` or, after explicit approval, `文件狀態：正式附件`, together with approval time and calculation fingerprint when available. Large DRAFT banners and watermarks are not used.

Project identity is optional at the attachment level. Blank project name, number, or designer rows are omitted and may be inherited from the enclosing main report. Their absence does not prevent printing or formal approval.

Shared report renderers filter known page-only labels and must not accept interface highlight or summary-card payloads as printable content. Browser and rendered-artifact tests reject those labels, verify the approval checkbox and status footer, and confirm that calculation content precedes the conclusion.

A work page is not an alternate calculation-book renderer. When a tool has a dedicated calculation-book action, direct browser printing of the work page renders only a blocked-print notice and excludes the complete interface and results. Printable internal-review and formal-attachment documents remain available through the calculation-book action.
