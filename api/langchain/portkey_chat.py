import json
import os
import time
from typing import Any, Optional, Sequence

from dotenv import load_dotenv
from langchain_core.callbacks import CallbackManagerForLLMRun
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import AIMessage, BaseMessage, ToolMessage
from langchain_core.outputs import ChatGeneration, ChatResult
from langchain_core.runnables import Runnable
from langchain_core.utils.function_calling import convert_to_openai_tool
from portkey_ai import Portkey
from pydantic import Field, PrivateAttr

load_dotenv()

DEFAULT_PORTKEY_MODEL = "@vertexai/gemini-3.1-flash-lite"
DEFAULT_PORTKEY_USER = "yfw215"


def _portkey_base_url() -> str:
    base_url = os.getenv("PORTKEY_BASE_URL")
    if base_url is not None:
        return base_url

    return (
        "https://portkey-lb.rt.nyu.edu/v1/"
        if os.getenv("DOCKER_ENV", "local").lower() == "hsrn"
        else "https://ai-gateway.apps.cloud.rt.nyu.edu/v1/"
    )


def build_portkey_chat_model(
    model: Optional[str] = None,
    request_timeout_seconds: Optional[int] = None,
    max_retries: int = 3,
) -> "PortkeyChatModel":
    api_key = os.getenv("PORTKEY_API_KEY")
    if not api_key:
        raise RuntimeError("PORTKEY_API_KEY is required when LLM_PROVIDER=portkey")

    return PortkeyChatModel(
        model_name=model or os.getenv("PORTKEY_MODEL") or DEFAULT_PORTKEY_MODEL,
        api_key=api_key,
        base_url=_portkey_base_url(),
        request_timeout_ms=(request_timeout_seconds or 1000) * 1000,
        max_retries=max_retries,
        user=os.getenv("PORTKEY_USER", DEFAULT_PORTKEY_USER),
    )


class PortkeyChatModel(BaseChatModel):
    model_name: str
    api_key: str = Field(repr=False, exclude=True)
    base_url: str
    request_timeout_ms: int = 1_000_000
    max_retries: int = 3
    user: str = DEFAULT_PORTKEY_USER

    _client: Any = PrivateAttr(default=None)

    @property
    def _llm_type(self) -> str:
        return "portkey-chat"

    @property
    def _identifying_params(self) -> dict[str, Any]:
        return {"model_name": self.model_name, "base_url": self.base_url}

    def bind_tools(
        self,
        tools: Sequence[Any],
        *,
        tool_choice: Optional[str] = None,
        **kwargs: Any,
    ) -> Runnable:
        kwargs["tools"] = [convert_to_openai_tool(tool) for tool in tools]
        if tool_choice:
            kwargs["tool_choice"] = "required" if tool_choice == "any" else tool_choice
        return self.bind(**kwargs)

    def _get_client(self) -> Any:
        if self._client is None:
            self._client = Portkey(
                api_key=self.api_key,
                base_url=self.base_url,
                metadata={"_user": self.user},
                request_timeout=self.request_timeout_ms,
                strict_open_ai_compliance=False,
            )
        return self._client

    def _generate(
        self,
        messages: list[BaseMessage],
        stop: Optional[list[str]] = None,
        run_manager: Optional[CallbackManagerForLLMRun] = None,
        **kwargs: Any,
    ) -> ChatResult:
        payload = {
            "model": self.model_name,
            "messages": [self._message_to_dict(message) for message in messages],
        }
        if stop:
            payload["stop"] = stop
        payload.update(kwargs)

        for attempt in range(self.max_retries):
            try:
                response = self._get_client().chat.completions.create(**payload)
                return self._response_to_chat_result(response)
            except Exception as exc:
                if attempt >= self.max_retries - 1 or not self._is_retryable(exc):
                    raise
                time.sleep(1.25 * (attempt + 1))

        raise RuntimeError("Portkey request failed without an exception")

    @classmethod
    def _message_to_dict(cls, message: BaseMessage) -> dict[str, Any]:
        message_dict: dict[str, Any] = {
            "role": cls._role_for_message(message),
            "content": message.content if message.content is not None else "",
        }

        if isinstance(message, ToolMessage):
            message_dict["tool_call_id"] = message.tool_call_id
            if message.name:
                message_dict["name"] = message.name

        tool_calls = cls._tool_calls_to_openai(message)
        if tool_calls:
            message_dict["tool_calls"] = tool_calls

        return message_dict

    @staticmethod
    def _role_for_message(message: BaseMessage) -> str:
        return {
            "system": "system",
            "human": "user",
            "ai": "assistant",
            "tool": "tool",
        }.get(message.type, message.type)

    @staticmethod
    def _tool_calls_to_openai(message: BaseMessage) -> list[dict[str, Any]]:
        if not isinstance(message, AIMessage):
            return []

        tool_calls = []
        for idx, tool_call in enumerate(message.tool_calls, start=1):
            args = tool_call.get("args") or {}
            raw_args = args if isinstance(args, str) else json.dumps(args)
            tool_calls.append(
                {
                    "id": tool_call.get("id") or f"call_{idx}",
                    "type": "function",
                    "function": {
                        "name": tool_call.get("name", ""),
                        "arguments": raw_args,
                    },
                }
            )
        return tool_calls

    @classmethod
    def _response_to_chat_result(cls, response: Any) -> ChatResult:
        choices = cls._get(response, "choices", []) or []
        if not choices:
            return ChatResult(
                generations=[ChatGeneration(message=AIMessage(content=""))]
            )

        choice = choices[0]
        message = cls._get(choice, "message")
        content = cls._message_content(message)
        ai_message = AIMessage(
            content=content,
            tool_calls=cls._extract_tool_calls(message),
            response_metadata={
                "finish_reason": cls._get(choice, "finish_reason"),
                "model": cls._get(response, "model"),
            },
        )
        return ChatResult(generations=[ChatGeneration(message=ai_message)])

    @classmethod
    def _extract_tool_calls(cls, message: Any) -> list[dict[str, Any]]:
        extracted = []
        for idx, tool_call in enumerate(
            cls._get(message, "tool_calls", []) or [], start=1
        ):
            function_data = cls._get(tool_call, "function")
            raw_args = cls._get(function_data, "arguments", "{}") or "{}"
            try:
                args = json.loads(raw_args)
            except json.JSONDecodeError:
                args = {}

            extracted.append(
                {
                    "name": cls._get(function_data, "name", ""),
                    "args": args,
                    "id": cls._get(tool_call, "id", "") or f"call_{idx}",
                    "type": "tool_call",
                }
            )
        return extracted

    @classmethod
    def _message_content(cls, message: Any) -> str:
        content = cls._get(message, "content", "") or ""
        if content:
            return content

        content_blocks = cls._get(message, "content_blocks", None)
        if content_blocks is None:
            content_blocks = cls._get(
                cls._get(message, "model_extra", {}) or {},
                "content_blocks",
                [],
            )
        if not isinstance(content_blocks, list):
            return ""

        return "".join(
            block.get("text", "")
            for block in content_blocks
            if isinstance(block, dict) and block.get("type") == "text"
        )

    @staticmethod
    def _get(value: Any, key: str, default: Any = None) -> Any:
        if isinstance(value, dict):
            return value.get(key, default)
        return getattr(value, key, default)

    @staticmethod
    def _is_retryable(exc: Exception) -> bool:
        message = str(exc)
        return any(
            code in message
            for code in (
                "429",
                "500",
                "502",
                "503",
                "504",
                "Bad Gateway",
                "Rate limit",
            )
        )
