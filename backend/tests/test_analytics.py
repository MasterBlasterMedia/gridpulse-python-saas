"""Known-answer and boundary tests for actual statistical behavior."""

import math

import pytest

from app.services.analytics import (
    detect_anomalies,
    forecast,
    predict,
    prioritize,
    priority_score,
    trend_percent,
)


def test_moving_average_known_answer():
    assert predict([1, 2, 3, 4, 5], "moving_average", 3, 0.25) == 4


def test_ewma_known_answer():
    assert predict([10, 20, 30], "ewma", 3, 0.5) == 22.5


@pytest.mark.parametrize("method", ["moving_average", "ewma"])
def test_constant_forecast_has_zero_error(method):
    result = forecast([42.0] * 96, method=method, horizon=12)
    assert result["predictions"] == [42] * 12
    assert result["mae_kw"] == 0
    assert result["rmse_kw"] == 0
    assert result["training_points"] == 72


def test_holdout_is_not_used_to_evaluate_fit():
    result = forecast([10.0] * 72 + [30.0] * 24, method="moving_average")
    assert result["mae_kw"] == 20
    assert result["rmse_kw"] == 20
    assert result["predictions"] == [30.0] * 24


@pytest.mark.parametrize(
    "values", [[], [10.0] * 20, [1.0] * 95 + [math.nan], [1.0] * 95 + [math.inf], [1.0] * 95 + [-1]]
)
def test_forecast_rejects_invalid_history(values):
    with pytest.raises(ValueError):
        forecast(values)


@pytest.mark.parametrize(
    "kwargs", [{"method": "magic"}, {"window": 0}, {"alpha": 0}, {"alpha": 1.1}]
)
def test_invalid_model_parameters(kwargs):
    args = {"method": "ewma", "window": 24, "alpha": 0.25, **kwargs}
    with pytest.raises(ValueError):
        predict([1, 2, 3], **args)


@pytest.mark.parametrize("horizon", [0, 73])
def test_invalid_horizon(horizon):
    with pytest.raises(ValueError):
        forecast([1.0] * 96, horizon=horizon)


def test_flat_and_short_signals_are_not_anomalies():
    assert detect_anomalies([100.0] * 96) == []
    assert detect_anomalies([100.0] * 3) == []
    assert detect_anomalies([]) == []


def test_spike_uses_only_preceding_observations():
    result = detect_anomalies([100.0] * 24 + [200.0])
    assert len(result) == 1
    assert result[0].index == 24
    assert result[0].baseline == 100
    assert result[0].score == 20


@pytest.mark.parametrize("missing", [None, math.nan, math.inf, -1.0])
def test_missing_or_invalid_readings_reset_window(missing):
    assert detect_anomalies([100.0] * 24 + [missing, 200.0]) == []


def test_threshold_controls_sensitivity_and_zero_baseline_is_finite():
    assert len(detect_anomalies([100.0] * 24 + [112.0], threshold=2)) == 1
    assert detect_anomalies([100.0] * 24 + [112.0], threshold=3) == []
    assert detect_anomalies([0.0] * 24 + [5.0])[0].score == 5


@pytest.mark.parametrize("kwargs", [{"window": 2}, {"threshold": 0}, {"threshold": 11}])
def test_invalid_anomaly_settings(kwargs):
    with pytest.raises(ValueError):
        detect_anomalies([], **kwargs)


def test_priority_includes_severity_impact_and_age():
    base = priority_score(2, 1, 0, 0)
    assert priority_score(3, 1, 0, 0) > base
    assert priority_score(2, 2, 0, 0) > base
    assert priority_score(2, 1, 100, 0) > base
    assert priority_score(2, 1, 0, 48) > base
    assert priority_score(2, 100, 10**20, 10000) == 528


def test_heap_top_k_and_ties_are_deterministic():
    assert prioritize([("z", 20), ("b", 30), ("a", 30), ("y", 1)], 2) == ["a", "b"]
    assert prioritize([]) == []
    with pytest.raises(ValueError):
        prioritize([], 0)
    with pytest.raises(ValueError):
        priority_score(5, 1, 1, 1)


def test_trends_have_explicit_undefined_baselines():
    assert trend_percent([10, 10, 20, 20]) == 100
    assert trend_percent([0, 0, 20, 20]) is None
    assert trend_percent([]) is None
