"""
Classification prompt for wedding lead emails.
"""

PROMPT = """Analyze this email for Meraki Wedding Planner (Vietnam wedding planning company).

Direction: {direction}
From: {sender}
To: {recipient}
Subject: {subject}
Body:
{body}

CLASSIFY as one of:
- new_lead: First inquiry about wedding services from a potential client (create new lead). Contact form submissions from the website are new leads.
- client_message: Reply or follow-up from an existing/potential client
- staff_message: Sent BY Meraki staff (contact@merakiweddingplanner.com) TO a client - general follow-up or response
- meeting_confirmed: Meeting, visit, or consultation date/time is mentioned or confirmed
- quote_sent: Sent BY Meraki staff containing quotation, pricing details, proposal, package information, or cost breakdown
- irrelevant: Spam, newsletters, vendor emails, automated notifications, not wedding-client-related

IMPORTANT CLASSIFICATION RULES:
- Emails from info@merakiweddingplanner.com with subject containing "Meraki Contact Form" are ALWAYS "new_lead" - these are website contact form submissions forwarded to the inbox
- If sender contains "merakiweddingplanner.com" or "merakiwp.com":
  - If subject contains "Meraki Contact Form" = "new_lead" (website contact form)
  - If email contains pricing, costs, packages, quotation, proposal = "quote_sent"
  - Otherwise = "staff_message"
- If it's a first-time wedding inquiry = "new_lead"
- If discussing existing wedding plans or is a reply = "client_message"
- Newsletters, promotions, vendor invoices, job applications = "irrelevant"

EXTRACT these fields - preserve raw text EXACTLY as written:

- firstname, lastname: Client's name (NOT Meraki staff)
- email: Client's email address (NOT contact@merakiweddingplanner.com)
- phone: Phone number
- address: City/country (e.g., "Australia", "Vietnam", "USA")
- coupleName: Both names together like "Mai & Duc" or "Sarah and John" or "Zoe and Liam"
- weddingVenue: Venue EXACTLY as written (e.g., "Saigon", "Flexible (currently browsing Phu Quoc)", "Hoi An or Da Nang")
- approximate: Guest count EXACTLY as written (e.g., "90-110", "150-250", "TBA")
- budget: Budget EXACTLY as written (e.g., "TBA", "50000-70000", "100000usd") - do NOT convert
- weddingDate: Date EXACTLY as written (e.g., "Flexible- would like to aim for end of 2026", "TBA end of 2027", "March-April 2026")
- position: Client's relationship - Bride, Groom, Family, or Friend
- ref: How they found Meraki - google, facebook, instagram, referral, or other
- moreDetails: The client's full message EXACTLY as written - preserve ALL text, newlines, and formatting. This is their inquiry/story.
- message_summary: Brief 1-sentence summary for activity log
- meeting_date: If a meeting is mentioned, date/time in YYYY-MM-DDTHH:MM format

Return ONLY valid JSON (no markdown, no explanation):
{{
  "classification": "...",
  "is_client_related": true/false,
  "firstname": "..." or null,
  "lastname": "..." or null,
  "email": "..." or null,
  "phone": "..." or null,
  "address": "..." or null,
  "coupleName": "..." or null,
  "weddingVenue": "..." or null,
  "approximate": "..." or null,
  "budget": "..." or null,
  "weddingDate": "..." or null,
  "position": "..." or null,
  "ref": "..." or null,
  "moreDetails": "..." or null,
  "message_summary": "...",
  "meeting_date": "..." or null
}}"""


EXTRACT_NEW_MESSAGE_PROMPT = """Extract the NEW message content from this email reply.

REMOVE ONLY the automatic email client quote - the previous email thread that gets auto-appended when replying:
- Text after "On [date], [person] wrote:" (the quoted reply)
- Lines starting with ">" (automatic quote markers)
- "----Original Message----" blocks
- "From: ... Sent: ... To: ..." forwarded message headers

KEEP:
- The person's actual new message they wrote
- Their signature (name, regards, etc.) if it's part of their message
- Any content before the automatic quote marker

Example:
INPUT:
"Hi Phung! Thanks for the info. Zoe

On 2 Feb 2026, Meraki Wedding Planner wrote:
Warmest greetings..."

OUTPUT:
"Hi Phung! Thanks for the info. Zoe"

Email content:
{body}

Return ONLY the new message content (before the automatic quote), nothing else:"""
