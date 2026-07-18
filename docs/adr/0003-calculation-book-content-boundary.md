---
status: accepted
---

# Keep calculation books calculation-first

Formal calculation books must present adopted engineering inputs, source and version trace, equations, substitutions, calculated results, code references attached to the relevant calculation, and the final engineering conclusion. The document must begin with traceable project metadata and calculation content; the conclusion follows the calculation content.

Input-mode guidance, report-mode labels, unit-switching explanations, screen navigation, reading priority, output settings, interface highlight cards, glossary teaching, and long clause explanations are page-only material. They may remain visible in the HTML work page but must not appear as calculation-book cover cards, report sections, printed output, or PDF content.

This boundary does not remove engineering basis from the calculation book. A clause number, adopted assumption, scope limitation, or manual-review item remains when it is necessary to understand or sign the calculation; it must be written next to the affected input, equation, result, or conclusion rather than as interface guidance. Draft/non-formal document classification also remains prominent because it changes the delivery status of the document.

Shared report renderers must filter known page-only labels and must not accept interface highlight or summary-card payloads as printable content. Browser and rendered-artifact tests must reject those labels and verify that calculation content precedes the conclusion.

A work page is not an alternate calculation-book renderer. When a tool has a dedicated calculation-book action, direct browser printing of the work page must render only a blocked-print notice and must exclude the complete interface, results, and any DRAFT watermark. Internal DRAFT and ready-to-sign documents remain available through the calculation-book action, where project metadata, calculation status, and manual-review traceability can be evaluated. Browser tests must verify the blocked notice with rendered visibility, confirm that no other body child is printable, and inspect the resulting one-page PDF text.
