"""
Wedding Planner Agent - FastAPI application with Gemini AI response suggestions.

Uses function calling to dynamically select tools based on the conversation context.
"""

import json
from contextlib import asynccontextmanager

from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from google import genai
from google.genai import types

from agent import __version__
from agent.config import settings
from agent.logging import configure_logging, get_logger
from agent.models import (
    SuggestResponseRequest,
    SuggestResponseResult,
    HealthResponse,
    GenerateRequest,
    GenerateResult,
)
from agent.prompts import PLANNER_PERSONA
from agent.tools import get_venue_info, get_wedding_history, analyze_lead_gaps

# Configure structured logging
configure_logging(log_level=settings.log_level, json_output=settings.json_logs)
log = get_logger(__name__)

# Global Gemini client
_client: genai.Client | None = None


# Define tools for function calling
TOOL_DEFINITIONS = [
    types.Tool(
        function_declarations=[
            types.FunctionDeclaration(
                name="get_venue_info",
                description="Fetch detailed information about a wedding venue in Vietnam. Use this when the client mentions a specific venue.",
                parameters=types.Schema(
                    type=types.Type.OBJECT,
                    properties={
                        "venue_name": types.Schema(
                            type=types.Type.STRING,
                            description="Name or partial name of the venue (e.g., 'The Reverie Saigon', 'Amanoi')",
                        ),
                    },
                    required=["venue_name"],
                ),
            ),
            types.FunctionDeclaration(
                name="get_wedding_history",
                description="Look up past weddings organized by Meraki, optionally filtered by venue. Use this to reference relevant past experience.",
                parameters=types.Schema(
                    type=types.Type.OBJECT,
                    properties={
                        "venue_name": types.Schema(
                            type=types.Type.STRING,
                            description="Filter by specific venue (optional)",
                        ),
                        "limit": types.Schema(
                            type=types.Type.INTEGER,
                            description="Maximum number of results to return (default: 10)",
                        ),
                    },
                ),
            ),
            types.FunctionDeclaration(
                name="analyze_lead_gaps",
                description="Analyze what information is missing from the lead profile to generate follow-up questions.",
                parameters=types.Schema(
                    type=types.Type.OBJECT,
                    properties={
                        "wedding_date": types.Schema(
                            type=types.Type.STRING,
                            description="Wedding date if known",
                        ),
                        "venue": types.Schema(
                            type=types.Type.STRING,
                            description="Venue if chosen",
                        ),
                        "guest_count": types.Schema(
                            type=types.Type.STRING,
                            description="Expected number of guests",
                        ),
                        "budget": types.Schema(
                            type=types.Type.STRING,
                            description="Budget if provided",
                        ),
                    },
                ),
            ),
        ]
    )
]

# Map tool names to functions
TOOL_FUNCTIONS = {
    "get_venue_info": get_venue_info,
    "get_wedding_history": get_wedding_history,
    "analyze_lead_gaps": analyze_lead_gaps,
}


def get_client() -> genai.Client:
    """Get or create Gemini client."""
    global _client
    if _client is None:
        if not settings.gemini_api_key:
            raise ValueError("GEMINI_API_KEY is required")
        _client = genai.Client(api_key=settings.gemini_api_key)
    return _client


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan - initialize and cleanup."""
    # Startup
    log.info(
        "wedding_planner_agent_starting",
        version=__version__,
        model=settings.gemini_model,
    )

    # Verify Gemini API key
    if not settings.gemini_api_key:
        log.warning("gemini_api_key_not_set")
    else:
        try:
            client = get_client()
            log.info("gemini_client_initialized")
        except Exception as e:
            log.error("gemini_client_init_failed", error=str(e))

    yield

    # Shutdown
    log.info("wedding_planner_agent_shutdown")


app = FastAPI(
    title="Wedding Planner Agent",
    description="AI-powered response suggestion service for Meraki Wedding Planner",
    version=__version__,
    lifespan=lifespan,
)

# Add CORS middleware for frontend access
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # In production, restrict to specific origins
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health", response_model=HealthResponse)
async def health_check():
    """Health check endpoint."""
    return HealthResponse(
        status="healthy",
        version=__version__,
        model=settings.gemini_model,
    )


@app.post("/generate", response_model=GenerateResult)
async def generate(request: GenerateRequest):
    """
    Generic text generation endpoint.

    Takes a system prompt and content, returns generated text.
    Used for generating lead summaries, etc.
    """
    log.info(
        "generate_start",
        content_length=len(request.content),
        temperature=request.temperature,
    )

    try:
        client = get_client()
    except ValueError as e:
        log.error("gemini_client_error", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))

    try:
        response = client.models.generate_content(
            model=settings.gemini_model,
            contents=[types.Content(role="user", parts=[types.Part(text=request.content)])],
            config=types.GenerateContentConfig(
                system_instruction=request.system_prompt,
                temperature=request.temperature or 0.7,
            ),
        )

        result_text = response.candidates[0].content.parts[0].text
        log.info("generate_complete", result_length=len(result_text))

        return GenerateResult(
            result=result_text,
            model=settings.gemini_model,
        )
    except Exception as e:
        log.error("generate_error", error=str(e))
        raise HTTPException(status_code=500, detail=f"Generation failed: {str(e)}")


def execute_tool_call(tool_name: str, args: dict) -> str:
    """Execute a tool call and return the result as JSON string."""
    if tool_name not in TOOL_FUNCTIONS:
        return json.dumps({"error": f"Unknown tool: {tool_name}"})

    try:
        result = TOOL_FUNCTIONS[tool_name](**args)
        return json.dumps(result, ensure_ascii=False)
    except Exception as e:
        log.error("tool_execution_error", tool=tool_name, error=str(e))
        return json.dumps({"error": str(e)})


@app.post("/suggest-response", response_model=SuggestResponseResult)
async def suggest_response(request: SuggestResponseRequest):
    """
    Generate response suggestion for a client communication.

    The agent will:
    1. Review the full conversation history
    2. Analyze the latest client message
    3. Optionally fetch venue info if a venue is mentioned
    4. Optionally look up past weddings
    5. Identify missing information to ask about
    6. Generate a personalized response suggestion
    """
    log.info(
        "suggest_response_start",
        lead_name=request.lead_name,
        communications_count=len(request.communications),
    )

    try:
        client = get_client()
    except ValueError as e:
        log.error("gemini_client_error", error=str(e))
        raise HTTPException(status_code=500, detail=str(e))

    # Format conversation history (newest first in the request, but we want oldest first for the LLM)
    communications_reversed = list(reversed(request.communications))
    conversation_lines = []
    for c in communications_reversed:
        direction = "Client" if c.direction == "Received" else "Meraki"
        date_str = f" ({c.date})" if c.date else ""
        subject_str = f" - Subject: {c.subject}" if c.subject else ""
        # Truncate very long messages
        content = c.content[:2000] if len(c.content) > 2000 else c.content
        conversation_lines.append(f"[{direction}]{date_str}{subject_str}:\n{content}")

    conversation = "\n\n".join(conversation_lines)

    # Map tone to writing style instructions
    tone_instructions = {
        "professional": "Write in a polished, business-appropriate tone. Be formal but not cold.",
        "warm": "Write in a warm, friendly, and personable tone. Be approachable and genuine.",
        "concise": "Be brief and to the point. Focus on essential information only.",
        "detailed": "Provide comprehensive information with full context and explanations.",
    }
    tone_style = tone_instructions.get(request.tone, tone_instructions["warm"])

    # Build the user prompt
    user_prompt = f"""
Lead Information:
- Name: {request.lead_name}
- Wedding Date: {request.wedding_date or 'Not specified'}
- Venue: {request.venue or 'Not specified'}
- Budget: {request.budget or 'Not specified'}
- Guest Count: {request.guest_count or 'Not specified'}

=== Conversation History (oldest to newest) ===
{conversation}

=== Task ===
Please analyze the conversation and suggest a response to the client.
If they mentioned a specific venue, use the get_venue_info tool.
Use get_wedding_history to reference past weddings if relevant.
Use analyze_lead_gaps to identify what information is missing and what follow-up questions to ask.

=== Tone ===
{tone_style}
"""

    # Add feedback if provided (for regeneration with user guidance)
    if request.feedback:
        user_prompt += f"""

=== User Feedback ===
The user has provided the following feedback for this regeneration:
"{request.feedback}"

Please incorporate this feedback while maintaining the overall tone and professionalism.
"""

    user_prompt += "\nGenerate a helpful response that Mai would send."

    # Log full context if debug enabled
    if settings.debug_prompts:
        log.info(
            "llm_full_context",
            system_instruction=PLANNER_PERSONA[:500] + "...",
            user_prompt=user_prompt,
        )

    # Initial request with tools
    messages = [
        types.Content(
            role="user",
            parts=[types.Part(text=user_prompt)],
        )
    ]

    tools_used = []
    follow_up_questions = []

    # Allow multiple rounds of tool calls
    max_iterations = 5
    for iteration in range(max_iterations):
        log.info("llm_generate_start", iteration=iteration)

        response = client.models.generate_content(
            model=settings.gemini_model,
            contents=messages,
            config=types.GenerateContentConfig(
                system_instruction=PLANNER_PERSONA,
                tools=TOOL_DEFINITIONS,
                temperature=0.7,
            ),
        )

        # Check if there are function calls
        function_calls = []
        text_response = None

        for part in response.candidates[0].content.parts:
            if part.function_call:
                function_calls.append(part.function_call)
            elif part.text:
                text_response = part.text

        if not function_calls:
            # No more function calls, we have the final response
            log.info("llm_generate_complete", tools_used=tools_used)
            break

        # Execute function calls
        tool_responses = []
        for fc in function_calls:
            tool_name = fc.name
            args = dict(fc.args) if fc.args else {}
            log.info("tool_call", tool=tool_name, args=args)

            tools_used.append(tool_name)
            result = execute_tool_call(tool_name, args)
            tool_responses.append(
                types.Part(
                    function_response=types.FunctionResponse(
                        name=tool_name,
                        response={"result": result},
                    )
                )
            )

            # Extract follow-up questions from analyze_lead_gaps
            if tool_name == "analyze_lead_gaps":
                try:
                    result_data = json.loads(result)
                    follow_up_questions = result_data.get("suggested_questions_en", [])
                except json.JSONDecodeError:
                    pass

        # Add the model's response and tool results to messages
        messages.append(response.candidates[0].content)
        messages.append(
            types.Content(
                role="user",
                parts=tool_responses,
            )
        )

    # Get the final text response
    final_response = text_response or "I apologize, but I couldn't generate a response. Please try again."

    log.info(
        "suggest_response_complete",
        lead_name=request.lead_name,
        tools_used=tools_used,
        response_length=len(final_response),
    )

    return SuggestResponseResult(
        suggested_response=final_response,
        tools_used=tools_used,
        follow_up_questions=follow_up_questions,
    )


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(app, host="0.0.0.0", port=8003)
