"""Tests for LLM providers."""

import pytest
from src.llm import get_provider, ToolDefinition
from src.llm.deepseek import DeepSeekProvider


@pytest.mark.asyncio
async def test_provider_initialization():
    provider = DeepSeekProvider(api_key="test-key")
    assert provider.api_key == "test-key"
    assert provider.default_model == "deepseek-chat"


@pytest.mark.asyncio
async def test_tool_definition():
    tool = ToolDefinition(
        name="get_time",
        description="Get current time",
        parameters={"type": "object", "properties": {}},
    )
    assert tool.name == "get_time"


@pytest.mark.asyncio
async def test_factory_defaults_to_deepseek():
    provider = get_provider()
    assert isinstance(provider, DeepSeekProvider)


@pytest.mark.asyncio
async def test_factory_explicit():
    provider = get_provider("deepseek")
    assert isinstance(provider, DeepSeekProvider)


def test_list_providers():
    from src.llm import list_providers
    names = list_providers()
    assert "deepseek" in names
