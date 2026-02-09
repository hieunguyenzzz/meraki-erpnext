"""
Classification prompts for supplier invoice emails.
"""

CLASSIFY_PROMPT = """Analyze this email for Meraki Wedding Planner (Vietnam wedding planning company).

Direction: {direction}
From: {sender}
To: {recipient}
Subject: {subject}
Has PDF Attachment: {has_pdf}
Body:
{body}

Determine if this is a SUPPLIER INVOICE email.

CLASSIFY as "supplier_invoice" if ALL of these are true:
- Email is from a vendor/supplier (NOT a wedding client asking about services)
- Contains or mentions: invoice, bill, payment request, receipt, or billing
- Has PDF attachment (likely the invoice document)

CLASSIFY as "irrelevant" if:
- Email is from a potential wedding client (inquiry about wedding services)
- Newsletter, marketing, or promotional email
- Job application or HR-related
- Automated notification without actual invoice

IMPORTANT RULES:
- Emails from vendors/suppliers about services rendered = "supplier_invoice"
- Emails from clients asking about wedding planning = "irrelevant" (not for this classifier)
- When in doubt if it's a supplier vs client, check the tone - suppliers send bills, clients ask questions

Return ONLY valid JSON (no markdown, no explanation):
{{
  "classification": "supplier_invoice" or "irrelevant",
  "is_supplier_email": true/false,
  "supplier_name": "extracted supplier/vendor name" or null,
  "invoice_mentioned": true/false,
  "reason": "brief explanation of classification"
}}"""


PDF_EXTRACTION_PROMPT = """Extract invoice details from this PDF invoice document.

Analyze the PDF content carefully and extract:
1. Supplier/vendor name (who is billing)
2. Invoice number (if visible)
3. Invoice date
4. Total amount
5. Currency (VND, USD, etc.)
6. Line items with descriptions and amounts

For expense categorization, use these ERPNext accounts:
- Office Expenses - MWP: office supplies, stationery, utilities
- Marketing Expenses - MWP: advertising, promotions, social media
- Travel Expenses - MWP: transportation, accommodation, meals during travel
- Software Expenses - MWP: subscriptions, licenses, SaaS tools
- Wedding Expenses - MWP: direct wedding-related vendor costs
- Venue Expenses - MWP: venue rental, catering at venues
- Miscellaneous Expenses - MWP: anything that doesn't fit above

Return ONLY valid JSON (no markdown, no explanation):
{{
  "supplier_name": "supplier/vendor name",
  "invoice_number": "invoice number if visible" or null,
  "invoice_date": "YYYY-MM-DD format" or null,
  "invoice_total": numeric_total_amount,
  "invoice_currency": "VND" or "USD" or other,
  "items": [
    {{
      "description": "line item description",
      "amount": numeric_amount,
      "expense_account": "one of the expense accounts listed above"
    }}
  ]
}}

If you cannot extract certain fields, use null. For items, if no line items are visible, create a single item with the description "Invoice" and the total amount."""
