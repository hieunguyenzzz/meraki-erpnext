"""Unit tests for PATCH /reviews/{name}: clearing fields and retired criteria (MWP-115)."""

from unittest.mock import MagicMock, patch

import pytest
from fastapi import HTTPException

from webhook_v2.routers.review import UpdateReviewRequest, update_review

CURRENT = {"data": {"ratings": [{"criterion": "Retired"}, {"criterion": "Teamwork"}]}}
ACTIVE = {"data": [{"name": "Teamwork"}, {"name": "Punctuality"}]}


def _client():
    c = MagicMock()
    c._get.side_effect = lambda url, params=None: ACTIVE if "Criterion" in url else CURRENT
    c._put.return_value = {"data": {}}
    return c


def _patch(body: dict):
    c = _client()
    with patch("webhook_v2.routers.review.ERPNextClient", return_value=c):
        update_review("R1", UpdateReviewRequest(**body))
    return c


def test_omitted_fields_are_untouched():
    c = _patch({"notes": "hi"})
    assert c._put.call_args[0][1] == {"notes": "hi"}


def test_explicit_null_clears_period_and_override():
    c = _patch({"period": None, "overall_score": None})
    assert c._put.call_args[0][1] == {"period": "", "overall_score": 0}


def test_override_value_is_kept():
    c = _patch({"overall_score": 7.5})
    assert c._put.call_args[0][1] == {"overall_score": 7.5}


def test_retired_criterion_already_on_review_can_be_saved():
    c = _patch({"ratings": [{"criterion": "Retired", "score": 5}, {"criterion": "Teamwork", "score": 8}]})
    assert len(c._put.call_args[0][1]["ratings"]) == 2


def test_new_inactive_criterion_is_rejected():
    with pytest.raises(HTTPException) as e:
        _patch({"ratings": [{"criterion": "Other", "score": 5}]})
    assert e.value.status_code == 400
