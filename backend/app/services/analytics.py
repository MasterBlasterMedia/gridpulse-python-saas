"""Explainable statistical baselines, deliberately independent of database and HTTP."""

import heapq
import math
from collections import deque
from dataclasses import dataclass
from statistics import fmean, pstdev
from typing import Literal


def validate_series(values: list[float], minimum: int = 1) -> None:
    """Refuse missing or nonfinite data instead of silently inventing observations."""
    if len(values) < minimum or any(not math.isfinite(v) or v < 0 for v in values):
        raise ValueError(f"At least {minimum} finite, nonnegative readings are required")


def predict(values: list[float], method: str, window: int, alpha: float) -> float:
    """Return a level forecast in O(n) time and O(1) extra space for EWMA."""
    validate_series(values)
    if window < 1 or not 0 < alpha <= 1:
        raise ValueError("window must be positive and alpha in (0, 1]")
    if method == "moving_average":
        # A level baseline is intentionally conservative; it cannot extrapolate seasonality.
        return fmean(values[-window:])
    if method != "ewma":
        raise ValueError("Unknown forecasting method")
    level = values[0]
    for value in values[1:]:
        level = alpha * value + (1 - alpha) * level
    return level


def forecast(
    values: list[float],
    method: Literal["moving_average", "ewma"] = "ewma",
    horizon: int = 24,
    window: int = 24,
    alpha: float = 0.25,
) -> dict[str, object]:
    """Evaluate a frozen level against the final 24 hours, then refit on all data."""
    validate_series(values, max(48, window + 24))
    if not 1 <= horizon <= 72:
        raise ValueError("Forecast horizon must be between 1 and 72 hours")
    training, holdout = values[:-24], values[-24:]
    # No holdout values are fed back into the model: errors describe a true 24h forecast.
    baseline = predict(training, method, window, alpha)
    errors = [actual - baseline for actual in holdout]
    level = predict(values, method, window, alpha)
    return {
        "method": method,
        "window": window,
        "alpha": alpha,
        "horizon": horizon,
        "predictions": [round(level, 3)] * horizon,
        "mae_kw": round(fmean(abs(error) for error in errors), 3),
        "rmse_kw": round(math.sqrt(fmean(error * error for error in errors)), 3),
        "training_points": len(training),
        "evaluation_points": len(holdout),
        "evaluation": "Chronological, frozen-origin 24-hour holdout; refit on all observations",
        "limitation": "Level-only statistical baseline; does not model weather or daily seasonality.",
    }


@dataclass(frozen=True)
class Anomaly:
    """Attach the observed deviation to its location in the input series."""

    index: int
    actual: float
    baseline: float
    score: float


def detect_anomalies(
    values: list[float | None],
    window: int = 24,
    threshold: float = 3.0,
) -> list[Anomaly]:
    """Detect trailing-window deviations in O(n*w) time and O(w + a) space."""
    if window < 3 or not 1 <= threshold <= 10:
        raise ValueError("window >= 3 and threshold between 1 and 10 are required")
    history: deque[float] = deque(maxlen=window)
    anomalies = []
    for index, value in enumerate(values):
        # A missing or invalid interval resets the window, so unrelated periods are not joined.
        if value is None or not math.isfinite(value) or value < 0:
            history.clear()
            continue
        if len(history) == window:
            mean = fmean(history)
            # A 5% engineering floor avoids infinite scores for flat meter traces.
            scale = max(pstdev(history), abs(mean) * 0.05, 1.0)
            score = abs(value - mean) / scale
            if score >= threshold:
                anomalies.append(Anomaly(index, value, round(mean, 3), round(score, 3)))
        history.append(value)
    return anomalies


def trend_percent(values: list[float]) -> float | None:
    """Compare equal adjacent halves; an all-zero baseline has no defined percentage."""
    if len(values) < 2:
        return None
    half = len(values) // 2
    before, after = fmean(values[-2 * half : -half]), fmean(values[-half:])
    return round((after - before) / before * 100, 2) if before > 0 else None


def priority_score(severity: int, facilities: int, customers: int, age_hours: float) -> float:
    """Combine severity with bounded impact and waiting time; this is a policy, not ML."""
    if severity not in range(1, 5) or min(facilities, customers, age_hours) < 0:
        raise ValueError("Invalid incident priority inputs")
    # Caps keep one very old or high-population incident from dominating indefinitely.
    return round(
        severity * 100
        + min(facilities, 20) * 10
        + min(math.log1p(customers) * 8, 80)
        + min(age_hours * 0.5, 48),
        2,
    )


def prioritize(items: list[tuple[str, float]], limit: int = 20) -> list[str]:
    """Select top k in O(n log k) time and O(k) space; ID resolves equal scores."""
    if limit < 1:
        raise ValueError("limit must be positive")
    # nsmallest over a negative score provides stable, deterministic top-k selection.
    return [
        identifier
        for identifier, _ in heapq.nsmallest(limit, items, key=lambda item: (-item[1], item[0]))
    ]
