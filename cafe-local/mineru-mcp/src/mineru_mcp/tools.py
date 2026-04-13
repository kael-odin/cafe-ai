"""MCP Tools for MinerU document parsing.

This module defines the MCP tools that expose MinerU's document parsing capabilities.
"""

import json
from typing import Any, Optional

from mcp.server import Server
from mcp.types import Tool, TextContent
from pydantic import BaseModel, Field

from .client import MinerUClient, ParseResult, TaskStatus


class ParseDocumentInput(BaseModel):
    """Input schema for parse_document tool."""

    file_path: str = Field(description="Path to the document file (PDF, DOCX, or image)")
    lang: str = Field(
        default="ch",
        description="Language code: ch (Chinese/English), en (English), korean, japan, etc.",
    )
    backend: str = Field(
        default="vlm-http-client",
        description="Parsing backend: pipeline, vlm-auto-engine, hybrid-auto-engine, vlm-http-client, etc.",
    )
    parse_method: str = Field(
        default="auto",
        description="Parse method: auto, txt (text extraction), ocr",
    )
    formula_enable: bool = Field(
        default=True,
        description="Enable formula parsing (LaTeX output)",
    )
    table_enable: bool = Field(
        default=True,
        description="Enable table parsing (HTML output)",
    )
    return_images: bool = Field(
        default=False,
        description="Return images as base64-encoded strings",
    )
    start_page: int = Field(
        default=0,
        description="Start page ID (0-indexed, 0 = first page)",
    )
    end_page: int = Field(
        default=-1,
        description="End page ID (-1 = all pages)",
    )


class ParseDocumentsBatchInput(BaseModel):
    """Input schema for parse_documents_batch tool."""

    file_paths: list[str] = Field(description="List of paths to document files")
    lang: str = Field(default="ch", description="Language code")
    backend: str = Field(default="vlm-http-client", description="Parsing backend")
    parse_method: str = Field(default="auto", description="Parse method")
    formula_enable: bool = Field(default=True, description="Enable formula parsing")
    table_enable: bool = Field(default=True, description="Enable table parsing")
    return_images: bool = Field(default=False, description="Return images as base64")
    start_page: int = Field(default=0, description="Start page ID")
    end_page: int = Field(default=-1, description="End page ID")


class SubmitAsyncTaskInput(BaseModel):
    """Input schema for submit_async_task tool."""

    file_paths: list[str] = Field(description="List of paths to document files")
    lang: str = Field(default="ch", description="Language code")
    backend: str = Field(default="vlm-http-client", description="Parsing backend")
    parse_method: str = Field(default="auto", description="Parse method")
    formula_enable: bool = Field(default=True, description="Enable formula parsing")
    table_enable: bool = Field(default=True, description="Enable table parsing")
    return_images: bool = Field(default=False, description="Return images as base64")
    start_page: int = Field(default=0, description="Start page ID")
    end_page: int = Field(default=-1, description="End page ID")


class GetTaskStatusInput(BaseModel):
    """Input schema for get_task_status tool."""

    task_id: str = Field(description="Task ID returned by submit_async_task")


class GetTaskResultInput(BaseModel):
    """Input schema for get_task_result tool."""

    task_id: str = Field(description="Task ID of a completed task")


def format_parse_result(result: ParseResult) -> str:
    """Format a ParseResult for display to the agent.

    Args:
        result: ParseResult object

    Returns:
        Formatted string for display
    """
    if result.error:
        return f"❌ Error parsing {result.file_name}: {result.error}"

    output = [f"✅ Successfully parsed: {result.file_name}"]

    if result.markdown:
        output.append("\n## Markdown Content:")
        output.append(result.markdown)

    if result.images:
        output.append(f"\n## Images: {len(result.images)} images extracted")
        for img_name in list(result.images.keys())[:5]:  # Show first 5
            output.append(f"  - {img_name}")
        if len(result.images) > 5:
            output.append(f"  ... and {len(result.images) - 5} more")

    if result.content_list:
        output.append(f"\n## Content List: {len(result.content_list)} items")

    return "\n".join(output)


def format_task_status(status: TaskStatus) -> str:
    """Format a TaskStatus for display.

    Args:
        status: TaskStatus object

    Returns:
        Formatted string for display
    """
    status_emoji = {
        "pending": "⏳",
        "processing": "🔄",
        "completed": "✅",
        "failed": "❌",
    }

    emoji = status_emoji.get(status.status, "❓")
    output = [
        f"{emoji} Task Status: {status.status}",
        f"Task ID: {status.task_id}",
    ]

    if status.queued_ahead is not None and status.queued_ahead > 0:
        output.append(f"Queued ahead: {status.queued_ahead} tasks")

    if status.error:
        output.append(f"Error: {status.error}")

    if status.status_url:
        output.append(f"Status URL: {status.status_url}")

    if status.result_url:
        output.append(f"Result URL: {status.result_url}")

    return "\n".join(output)


def create_tools(server: Server, mineru_url: str) -> list[Tool]:
    """Create MCP tools for MinerU.

    Args:
        server: MCP server instance
        mineru_url: URL of the MinerU FastAPI service

    Returns:
        List of Tool objects
    """

    @server.list_tools()
    async def list_tools() -> list[Tool]:
        """List available tools."""
        return [
            Tool(
                name="parse_document",
                description="Parse a single PDF/DOCX/image document and return Markdown content. "
                "Use this for quick parsing of individual documents. "
                "Supports formula (LaTeX) and table (HTML) extraction.",
                inputSchema=ParseDocumentInput.model_json_schema(),
            ),
            Tool(
                name="parse_documents_batch",
                description="Parse multiple documents in a single request. "
                "More efficient than parsing documents one by one. "
                "Returns Markdown content for each document.",
                inputSchema=ParseDocumentsBatchInput.model_json_schema(),
            ),
            Tool(
                name="submit_async_task",
                description="Submit an asynchronous parsing task for large documents. "
                "Returns a task ID that can be used to check status and retrieve results. "
                "Use this for documents that may take a long time to parse.",
                inputSchema=SubmitAsyncTaskInput.model_json_schema(),
            ),
            Tool(
                name="get_task_status",
                description="Check the status of an async parsing task. "
                "Returns current status: pending, processing, completed, or failed.",
                inputSchema=GetTaskStatusInput.model_json_schema(),
            ),
            Tool(
                name="get_task_result",
                description="Retrieve the result of a completed async task. "
                "Only call this after get_task_status returns 'completed'.",
                inputSchema=GetTaskResultInput.model_json_schema(),
            ),
            Tool(
                name="health_check",
                description="Check if the MinerU service is running and healthy. "
                "Use this to verify the service is available before parsing documents.",
                inputSchema={"type": "object", "properties": {}},
            ),
        ]

    @server.call_tool()
    async def call_tool(name: str, arguments: dict[str, Any]) -> list[TextContent]:
        """Handle tool calls."""
        async with MinerUClient(base_url=mineru_url) as client:
            try:
                if name == "parse_document":
                    input_data = ParseDocumentInput(**arguments)
                    result = await client.parse_document(
                        file_path=input_data.file_path,
                        lang=input_data.lang,
                        backend=input_data.backend,
                        parse_method=input_data.parse_method,
                        formula_enable=input_data.formula_enable,
                        table_enable=input_data.table_enable,
                        return_images=input_data.return_images,
                        start_page_id=input_data.start_page,
                        end_page_id=input_data.end_page,
                    )
                    return [TextContent(type="text", text=format_parse_result(result))]

                elif name == "parse_documents_batch":
                    input_data = ParseDocumentsBatchInput(**arguments)
                    results = await client.parse_documents_batch(
                        file_paths=input_data.file_paths,
                        lang=input_data.lang,
                        backend=input_data.backend,
                        parse_method=input_data.parse_method,
                        formula_enable=input_data.formula_enable,
                        table_enable=input_data.table_enable,
                        return_images=input_data.return_images,
                        start_page_id=input_data.start_page,
                        end_page_id=input_data.end_page,
                    )
                    formatted = [format_parse_result(r) for r in results]
                    return [TextContent(type="text", text="\n\n---\n\n".join(formatted))]

                elif name == "submit_async_task":
                    input_data = SubmitAsyncTaskInput(**arguments)
                    status = await client.submit_async_task(
                        file_paths=input_data.file_paths,
                        lang=input_data.lang,
                        backend=input_data.backend,
                        parse_method=input_data.parse_method,
                        formula_enable=input_data.formula_enable,
                        table_enable=input_data.table_enable,
                        return_images=input_data.return_images,
                        start_page_id=input_data.start_page,
                        end_page_id=input_data.end_page,
                    )
                    return [TextContent(type="text", text=format_task_status(status))]

                elif name == "get_task_status":
                    input_data = GetTaskStatusInput(**arguments)
                    status = await client.get_task_status(input_data.task_id)
                    return [TextContent(type="text", text=format_task_status(status))]

                elif name == "get_task_result":
                    input_data = GetTaskResultInput(**arguments)
                    result = await client.get_task_result(input_data.task_id)
                    return [
                        TextContent(
                            type="text",
                            text=json.dumps(result, indent=2, ensure_ascii=False),
                        )
                    ]

                elif name == "health_check":
                    is_healthy = await client.health_check()
                    status_text = (
                        "✅ MinerU service is healthy"
                        if is_healthy
                        else "❌ MinerU service is not responding"
                    )
                    return [TextContent(type="text", text=status_text)]

                else:
                    return [TextContent(type="text", text=f"Unknown tool: {name}")]

            except Exception as e:
                return [TextContent(type="text", text=f"❌ Error: {str(e)}")]

    return []
