"""Labels & Access Control — tag-based visibility filtering.

Labels attached to agents, contexts, and sessions control
visibility per user/tenant/role. Label filtering is implemented at the
proxy API layer without requiring database schema changes.

How it works:
- Agents, contexts, and sessions carry a `labels` field (JSON array of strings)
- API requests include `?labels=label1,label2` query parameter
- The proxy filters results to only show resources matching the user's labels
- Empty label filter (admin) returns all resources
"""

from __future__ import annotations

from typing import Any


def filter_by_labels(
    items: list[dict[str, Any]],
    user_labels: list[str],
) -> list[dict[str, Any]]:
    """Filter a list of resources to only those matching the user's labels.

    Rules:
    - Empty user_labels → return all (admin/no filter)
    - Resource has no labels → visible to everyone (public)
    - Resource has labels → only visible if at least one label matches
    """
    if not user_labels:
        return items

    user_set = set(l.strip().lower() for l in user_labels if l.strip())

    return [
        item for item in items
        if _is_visible(item.get("labels", []), user_set)
    ]


def _is_visible(resource_labels: list[str], user_labels: set[str]) -> bool:
    """Check if a resource is visible to a user based on label matching."""
    if not resource_labels:
        return True  # No labels = public

    resource_set = set(l.strip().lower() for l in resource_labels if isinstance(l, str) and l.strip())

    # At least one label must match
    return bool(resource_set & user_labels)


def validate_label_access(
    resource: dict[str, Any],
    user_labels: list[str],
    action: str = "read",
) -> bool:
    """Check if a user has access to a specific resource.

    Returns True if access is granted.
    """
    if not user_labels:
        return True  # Admin

    resource_labels = resource.get("labels", [])
    if not resource_labels:
        return True  # Public resource

    user_set = set(l.strip().lower() for l in user_labels if l.strip())
    resource_set = set(l.strip().lower() for l in resource_labels if isinstance(l, str) and l.strip())

    return bool(resource_set & user_set)


def parse_labels_from_request(labels_param: str | None) -> list[str]:
    """Parse labels from a comma-separated query parameter."""
    if not labels_param:
        return []
    return [l.strip() for l in labels_param.split(",") if l.strip()]
