# Wedding Planner Agent

AI-powered response suggestion service for Meraki Wedding Planner CRM. Uses Google Gemini to generate personalized email responses based on conversation history and lead context.

## Architecture

- **Service**: `wedding-planner-agent` (FastAPI)
- **Port**: 8003
- **Model**: Gemini 2.0 Flash (configurable via `GEMINI_MODEL`)
- **Location**: `wedding-planner-agent/`

## API Endpoints

### POST /suggest-response

Generate a response suggestion for a client communication.

**Request:**
```json
{
  "lead_name": "Lina Nguyen",
  "communications": [
    {
      "direction": "Received",
      "content": "Hi, I'm interested in...",
      "date": "2026-02-08",
      "subject": "Wedding Inquiry"
    }
  ],
  "wedding_date": "2027-11-03",
  "venue": "The Reverie Saigon",
  "budget": "30000-40000 USD",
  "guest_count": "70",
  "tone": "warm"
}
```

**Tone options:** `professional`, `warm`, `concise`, `detailed`

### GET /health

Health check endpoint.

## Tools (Function Calling)

The agent can call these tools during generation:

| Tool | Purpose |
|------|---------|
| `analyze_lead_gaps` | Identify missing information (budget, date, venue, etc.) |
| `get_wedding_history` | Lookup past weddings, optionally filtered by venue |
| `get_venue_info` | Fetch venue details from ERPNext Supplier records |

## Debugging

### View Full LLM Context

To see the complete prompt sent to Gemini (system instruction + user prompt):

1. **Enable debug logging:**
   ```bash
   DEBUG_PROMPTS=true docker compose -f docker-compose.yml -f docker-compose.local.yml up wedding-planner-agent -d
   ```

2. **Generate a response** (click "Suggest Response" on a lead in the frontend)

3. **View the full context:**
   ```bash
   # Raw log output
   docker compose logs wedding-planner-agent --tail 50 | grep -A 100 "llm_full_context"

   # Pretty print just the user prompt
   docker compose logs wedding-planner-agent --tail 100 2>&1 | \
     grep "llm_full_context" | \
     sed 's/^[^{]*//' | \
     jq -r '.user_prompt'
   ```

### View Tool Calls

See which tools were called and their arguments:
```bash
docker compose logs wedding-planner-agent --tail 100 | grep "tool_call"
```

### View Complete Generation Flow

```bash
docker compose logs wedding-planner-agent --tail 200 | grep -E "(suggest_response|llm_generate|tool_call)"
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `GEMINI_API_KEY` | Google Gemini API key | Required |
| `GEMINI_MODEL` | Model to use | `gemini-2.0-flash` |
| `ERPNEXT_URL` | ERPNext API base URL | `http://merakierp.loc` |
| `ERPNEXT_API_KEY` | ERPNext API key | Required for tools |
| `ERPNEXT_API_SECRET` | ERPNext API secret | Required for tools |
| `DEBUG_PROMPTS` | Log full LLM prompts | `false` |
| `LOG_LEVEL` | Logging level | `INFO` |
| `JSON_LOGS` | Use JSON log format | `true` |

## Persistence

AI suggestions are persisted to ERPNext Communication records:

- `custom_ai_suggestion` (Text) - The generated response
- `custom_ai_tone` (Select) - Tone used (professional/warm/concise/detailed)

This allows suggestions to persist across page visits and shows which client message the suggestion responds to.

## Common Issues

### Tools returning 404

If logs show `wedding_history_failed` or `venue_lookup_failed` with 404:
- Check `ERPNEXT_URL` is correct (should be `http://meraki-backend:8000` in Docker)
- Verify `ERPNEXT_API_KEY` and `ERPNEXT_API_SECRET` are set
- Ensure the ERPNext backend container is running
