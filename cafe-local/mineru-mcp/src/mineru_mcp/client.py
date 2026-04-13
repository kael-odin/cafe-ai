"""MinerU API Client for MCP Server.

This module provides a client for communicating with the MinerU FastAPI service.
"""

import asyncio
import base64
from pathlib import Path
from typing import Any, Optional

import httpx
from pydantic import BaseModel, Field


class ParseResult(BaseModel):
    """Result of a document parsing operation."""

    file_name: str
    markdown: Optional[str] = None
    middle_json: Optional[dict[str, Any]] = None
    model_output: Optional[dict[str, Any]] = None
    content_list: Optional[list[dict[str, Any]]] = None
    images: Optional[dict[str, str]] = None  # filename -> base64
    error: Optional[str] = None


class TaskStatus(BaseModel):
    """Status of an async parsing task."""

    task_id: str
    status: str  # pending, processing, completed, failed
    created_at: Optional[str] = None
    started_at: Optional[str] = None
    completed_at: Optional[str] = None
    error: Optional[str] = None
    queued_ahead: Optional[int] = None
    status_url: Optional[str] = None
    result_url: Optional[str] = None


class MinerUClient:
    """Client for MinerU FastAPI service."""

    def __init__(
        self,
        base_url: str = "http://localhost:18000",
        timeout: float = 300.0,  # 5 minutes default timeout
    ):
        """Initialize the MinerU client.

        Args:
            base_url: Base URL of the MinerU FastAPI service
            timeout: Request timeout in seconds
        """
        self.base_url = base_url.rstrip("/")
        self.timeout = timeout
        self._client: Optional[httpx.AsyncClient] = None

    async def __aenter__(self) -> "MinerUClient":
        """Async context manager entry."""
        self._client = httpx.AsyncClient(
            base_url=self.base_url,
            timeout=self.timeout,
        )
        return self

    async def __aexit__(self, exc_type, exc_val, exc_tb) -> None:
        """Async context manager exit."""
        if self._client:
            await self._client.aclose()
            self._client = None

    @property
    def client(self) -> httpx.AsyncClient:
        """Get the HTTP client."""
        if self._client is None:
            raise RuntimeError("Client not initialized. Use async context manager.")
        return self._client

    async def health_check(self) -> bool:
        """Check if the MinerU service is healthy.

        Returns:
            True if the service is healthy, False otherwise
        """
        try:
            response = await self.client.get("/health")
            return response.status_code == 200
        except Exception:
            return False

    async def parse_document(
        self,
        file_path: str,
        lang: str = "ch",
        backend: str = "vlm-http-client",
        parse_method: str = "auto",
        formula_enable: bool = True,
        table_enable: bool = True,
        return_md: bool = True,
        return_middle_json: bool = False,
        return_model_output: bool = False,
        return_content_list: bool = False,
        return_images: bool = False,
        start_page_id: int = 0,
        end_page_id: int = -1,
    ) -> ParseResult:
        """Parse a single document synchronously.

        Args:
            file_path: Path to the document file
            lang: Language code (ch, en, korean, japan, etc.)
            backend: Parsing backend (pipeline, vlm-auto-engine, hybrid-auto-engine, etc.)
            parse_method: Parse method (auto, txt, ocr)
            formula_enable: Enable formula parsing
            table_enable: Enable table parsing
            return_md: Return markdown content
            return_middle_json: Return middle JSON
            return_model_output: Return model output
            return_content_list: Return content list
            return_images: Return images as base64
            start_page_id: Start page ID (0-indexed)
            end_page_id: End page ID (-1 for all pages)

        Returns:
            ParseResult with parsed content
        """
        path = Path(file_path)
        if not path.exists():
            return ParseResult(file_name=path.name, error=f"File not found: {file_path}")

        # Read file content
        file_bytes = path.read_bytes()

        # Prepare multipart form data
        files = {"files": (path.name, file_bytes, "application/octet-stream")}
        data = {
            "lang_list": lang,
            "backend": backend,
            "parse_method": parse_method,
            "formula_enable": str(formula_enable).lower(),
            "table_enable": str(table_enable).lower(),
            "return_md": str(return_md).lower(),
            "return_middle_json": str(return_middle_json).lower(),
            "return_model_output": str(return_model_output).lower(),
            "return_content_list": str(return_content_list).lower(),
            "return_images": str(return_images).lower(),
            "start_page_id": str(start_page_id),
            "end_page_id": str(end_page_id),
        }

        try:
            response = await self.client.post(
                "/file_parse",
                files=files,
                data=data,
            )
            response.raise_for_status()

            result_data = response.json()
            results = result_data.get("results", {})

            # Extract result for the file
            file_key = path.stem
            file_result = results.get(file_key, {})

            return ParseResult(
                file_name=path.name,
                markdown=file_result.get("md"),
                middle_json=file_result.get("middle_json"),
                model_output=file_result.get("model_output"),
                content_list=file_result.get("content_list"),
                images=file_result.get("images"),
            )

        except httpx.HTTPStatusError as e:
            return ParseResult(
                file_name=path.name,
                error=f"HTTP error {e.response.status_code}: {e.response.text}",
            )
        except Exception as e:
            return ParseResult(file_name=path.name, error=str(e))

    async def parse_documents_batch(
        self,
        file_paths: list[str],
        lang: str = "ch",
        backend: str = "vlm-http-client",
        parse_method: str = "auto",
        formula_enable: bool = True,
        table_enable: bool = True,
        return_md: bool = True,
        return_middle_json: bool = False,
        return_model_output: bool = False,
        return_content_list: bool = False,
        return_images: bool = False,
        start_page_id: int = 0,
        end_page_id: int = -1,
    ) -> list[ParseResult]:
        """Parse multiple documents in a single request.

        Args:
            file_paths: List of paths to document files
            lang: Language code
            backend: Parsing backend
            parse_method: Parse method
            formula_enable: Enable formula parsing
            table_enable: Enable table parsing
            return_md: Return markdown content
            return_middle_json: Return middle JSON
            return_model_output: Return model output
            return_content_list: Return content list
            return_images: Return images as base64
            start_page_id: Start page ID
            end_page_id: End page ID

        Returns:
            List of ParseResult objects
        """
        # Prepare multipart form data with multiple files
        files = []
        file_stems = []
        for file_path in file_paths:
            path = Path(file_path)
            if not path.exists():
                continue
            file_bytes = path.read_bytes()
            files.append(("files", (path.name, file_bytes, "application/octet-stream")))
            file_stems.append(path.stem)

        if not files:
            return [
                ParseResult(file_name=Path(fp).name, error="File not found") for fp in file_paths
            ]

        data = {
            "lang_list": lang,
            "backend": backend,
            "parse_method": parse_method,
            "formula_enable": str(formula_enable).lower(),
            "table_enable": str(table_enable).lower(),
            "return_md": str(return_md).lower(),
            "return_middle_json": str(return_middle_json).lower(),
            "return_model_output": str(return_model_output).lower(),
            "return_content_list": str(return_content_list).lower(),
            "return_images": str(return_images).lower(),
            "start_page_id": str(start_page_id),
            "end_page_id": str(end_page_id),
        }

        try:
            response = await self.client.post(
                "/file_parse",
                files=files,
                data=data,
            )
            response.raise_for_status()

            result_data = response.json()
            results = result_data.get("results", {})

            parse_results = []
            for i, stem in enumerate(file_stems):
                file_result = results.get(stem, {})
                parse_results.append(
                    ParseResult(
                        file_name=Path(file_paths[i]).name,
                        markdown=file_result.get("md"),
                        middle_json=file_result.get("middle_json"),
                        model_output=file_result.get("model_output"),
                        content_list=file_result.get("content_list"),
                        images=file_result.get("images"),
                    )
                )

            return parse_results

        except httpx.HTTPStatusError as e:
            return [
                ParseResult(
                    file_name=Path(fp).name,
                    error=f"HTTP error {e.response.status_code}: {e.response.text}",
                )
                for fp in file_paths
            ]
        except Exception as e:
            return [ParseResult(file_name=Path(fp).name, error=str(e)) for fp in file_paths]

    async def submit_async_task(
        self,
        file_paths: list[str],
        lang: str = "ch",
        backend: str = "vlm-http-client",
        parse_method: str = "auto",
        formula_enable: bool = True,
        table_enable: bool = True,
        return_md: bool = True,
        return_middle_json: bool = False,
        return_model_output: bool = False,
        return_content_list: bool = False,
        return_images: bool = False,
        start_page_id: int = 0,
        end_page_id: int = -1,
    ) -> TaskStatus:
        """Submit an asynchronous parsing task.

        Args:
            file_paths: List of paths to document files
            lang: Language code
            backend: Parsing backend
            parse_method: Parse method
            formula_enable: Enable formula parsing
            table_enable: Enable table parsing
            return_md: Return markdown content
            return_middle_json: Return middle JSON
            return_model_output: Return model output
            return_content_list: Return content list
            return_images: Return images as base64
            start_page_id: Start page ID
            end_page_id: End page ID

        Returns:
            TaskStatus with task ID and status URL
        """
        # Prepare multipart form data
        files = []
        for file_path in file_paths:
            path = Path(file_path)
            if not path.exists():
                continue
            file_bytes = path.read_bytes()
            files.append(("files", (path.name, file_bytes, "application/octet-stream")))

        if not files:
            raise ValueError("No valid files to parse")

        data = {
            "lang_list": lang,
            "backend": backend,
            "parse_method": parse_method,
            "formula_enable": str(formula_enable).lower(),
            "table_enable": str(table_enable).lower(),
            "return_md": str(return_md).lower(),
            "return_middle_json": str(return_middle_json).lower(),
            "return_model_output": str(return_model_output).lower(),
            "return_content_list": str(return_content_list).lower(),
            "return_images": str(return_images).lower(),
            "start_page_id": str(start_page_id),
            "end_page_id": str(end_page_id),
        }

        response = await self.client.post(
            "/tasks",
            files=files,
            data=data,
        )
        response.raise_for_status()

        task_data = response.json()
        return TaskStatus(**task_data)

    async def get_task_status(self, task_id: str) -> TaskStatus:
        """Get the status of an async task.

        Args:
            task_id: Task ID

        Returns:
            TaskStatus with current status
        """
        response = await self.client.get(f"/tasks/{task_id}")
        response.raise_for_status()

        task_data = response.json()
        return TaskStatus(**task_data)

    async def get_task_result(self, task_id: str) -> dict[str, Any]:
        """Get the result of a completed async task.

        Args:
            task_id: Task ID

        Returns:
            Dictionary with parsing results
        """
        response = await self.client.get(f"/tasks/{task_id}/result")
        response.raise_for_status()

        return response.json()

    async def cancel_task(self, task_id: str) -> bool:
        """Cancel an async task.

        Args:
            task_id: Task ID

        Returns:
            True if cancelled successfully
        """
        response = await self.client.delete(f"/tasks/{task_id}")
        return response.status_code == 200
