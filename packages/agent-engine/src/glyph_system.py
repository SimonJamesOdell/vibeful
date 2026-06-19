"""Glyph System — symbolic visual representations linked to concepts.

Glyphs are Unicode symbols with names and descriptions that represent
conceptual frameworks. They act as visual anchors for the concept system.

Usage:
    gs = GlyphSystem(db)
    glyph = await gs.add("recursion", "🌀", "Recursive depth", "meta")
    all_glyphs = await gs.list_all()
    formatted = gs.format_for_prompt(all_glyphs)
"""

from __future__ import annotations

from typing import Any


class GlyphSystem:
    """Manages glyphs — symbolic visual representations for concepts."""

    def __init__(self, db: Any):
        self.db = db

    async def add(self, name: str, symbol: str, description: str = "", glyphset: str = "") -> dict[str, Any]:
        """Add or update a glyph. Uses upsert (by name)."""
        return await self.db.add_glyph({
            "name": name,
            "symbol": symbol,
            "description": description,
            "glyphset": glyphset,
        })

    async def get(self, name: str) -> dict[str, Any] | None:
        """Get a glyph by name."""
        return await self.db.get_glyph(name)

    async def list_all(self) -> list[dict[str, Any]]:
        """List all glyphs."""
        return await self.db.list_glyphs()

    def format_for_prompt(self, glyphs: list[dict[str, Any]] | None = None) -> str:
        """Format glyphs for injection into a system prompt.

        Returns a string like:
          (recursion) 🌀 — Recursive depth and self-reference
          (emergence) ⬡ — Patterns arising from simple rules
        """
        items = glyphs or []
        if not items:
            return ""
        lines = ["\n\n## Known Glyphs (Conceptual Icons)\n"]
        for g in items:
            name = g.get("name", "")
            symbol = g.get("symbol", "")
            desc = g.get("description", "")
            lines.append(f"({name}) {symbol} — {desc}")
        return "\n".join(lines)

    def format_list(self, glyphs: list[dict[str, Any]] | None = None) -> list[dict[str, str]]:
        """Format glyphs as a list of {name, symbol, description} dicts."""
        items = glyphs or []
        return [
            {
                "name": g.get("name", ""),
                "symbol": g.get("symbol", ""),
                "description": g.get("description", ""),
                "glyphset": g.get("glyphset", ""),
            }
            for g in items
        ]
