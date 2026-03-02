"""
Email Processing System v2 for Meraki Wedding Planner.

A clean, extensible email processing pipeline that:
- Fetches emails from IMAP (Zoho)
- Classifies them using the remote classifier-agent service
- Routes to appropriate handlers (Lead, Expense, HR)
- Creates records in ERPNext
"""
