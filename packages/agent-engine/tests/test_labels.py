"""Tests for the label access control system."""

import pytest
from src.labels import filter_by_labels, validate_label_access, parse_labels_from_request


class TestFilterByLabels:
    def test_admin_sees_all(self):
        items = [
            {"id": "1", "labels": ["admin"]},
            {"id": "2", "labels": ["public"]},
            {"id": "3", "labels": []},
        ]
        result = filter_by_labels(items, [])
        assert len(result) == 3

    def test_user_sees_matching(self):
        items = [
            {"id": "1", "labels": ["engineering"]},
            {"id": "2", "labels": ["marketing"]},
            {"id": "3", "labels": []},  # public
        ]
        result = filter_by_labels(items, ["engineering"])
        assert len(result) == 2
        assert {r["id"] for r in result} == {"1", "3"}

    def test_user_sees_none_if_no_match(self):
        items = [
            {"id": "1", "labels": ["engineering"]},
            {"id": "2", "labels": ["marketing"]},
        ]
        result = filter_by_labels(items, ["sales"])
        assert len(result) == 0


class TestValidateLabelAccess:
    def test_admin_always_granted(self):
        assert validate_label_access({"labels": ["secure"]}, []) is True

    def test_public_resource_always_granted(self):
        assert validate_label_access({"labels": []}, ["engineering"]) is True

    def test_matching_label_granted(self):
        assert validate_label_access({"labels": ["engineering"]}, ["engineering"]) is True

    def test_non_matching_label_denied(self):
        assert validate_label_access({"labels": ["engineering"]}, ["marketing"]) is False


class TestParseLabels:
    def test_empty(self):
        assert parse_labels_from_request(None) == []

    def test_single(self):
        assert parse_labels_from_request("engineering") == ["engineering"]

    def test_multiple(self):
        assert parse_labels_from_request("engineering, marketing") == ["engineering", "marketing"]

    def test_trims_whitespace(self):
        assert parse_labels_from_request(" eng , mkt ") == ["eng", "mkt"]
