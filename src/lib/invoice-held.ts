/** What each reason asks the reviewer to look at. */
export const HELD_LABEL: Record<string, string> = {
  reader_unsure: "Reader unsure of a figure",
  check_failed: "Figures do not add up",
  missing_vendor_name: "Supplier missing",
  missing_invoice_number: "Number missing",
  missing_invoice_date: "Date missing",
  missing_total_amount: "Total missing",
  readings_disagree: "Two readings disagree",
  hub_number_taken: "Number already in the Hub",
  duplicate: "Possible duplicate",
  buyer_not_us: "Not addressed to us",
  not_supplier_invoice_kind: "May not be a supplier invoice",
  not_double_read: "Not read twice yet",
  single_reading: "Read once only",
};
