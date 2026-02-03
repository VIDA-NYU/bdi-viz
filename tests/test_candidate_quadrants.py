import pandas as pd

from api.candidate_quadrants.candidate_quadrants import CandidateQuadrants


def _make_quadrant_fixture(monkeypatch):
    source = pd.DataFrame({"A": ["x", "y"], "B": [None, None]})
    target = pd.DataFrame({"A_t": ["x"], "B_t": ["y"], "C_t": [1]})

    col_matches = {
        "A": {"A_t": 0.8, "B_t": 0.97},
        "B": {"A_t": 0.75},
    }
    val_matches = {
        "A": {"A_t": 0.7, "C_t": 0.5},
        "B": {"C_t": 0.9},
    }

    class DummyColMatcher:
        def __init__(self, name):
            self.name = name

        def _get_matches(self, source_df, target_df, top_k):
            return col_matches

    class DummyValMatcher:
        def __init__(self, name):
            self.name = name

        def _get_matches(self, source_df, target_df, top_k):
            return val_matches

    monkeypatch.setattr(
        "api.candidate_quadrants.candidate_quadrants.RapidFuzzMatcher",
        DummyColMatcher,
        raising=True,
    )
    monkeypatch.setattr(
        "api.candidate_quadrants.candidate_quadrants.RapidFuzzValueMatcher",
        DummyValMatcher,
        raising=True,
    )

    cq = CandidateQuadrants(
        source,
        target,
        top_k=3,
        column_name_threshold=0.7,
        value_threshold=0.4,
    )
    return cq, source, target


def test_quadrants_and_easy_matches(monkeypatch):
    cq, _source, _target = _make_quadrant_fixture(monkeypatch)

    assert cq._quadrants is None
    easy = cq.get_easy_matches("A")
    assert cq._quadrants is not None
    assert set(easy) == {"A_t"}

    very_easy = cq.get_easy_matches("A", is_very_high=True)
    assert set(very_easy) == {"A_t", "B_t"}

    potential = cq.get_potential_matches("A")
    assert potential == ["B_t", "C_t"]

    potential_df = cq.get_potential_target_df("A")
    assert list(potential_df.columns) == ["B_t", "C_t"]

    unrelated = cq.get_unrelated_columns("A")
    assert unrelated == []


def test_nan_source_skips_value_matches(monkeypatch):
    cq, _source, _target = _make_quadrant_fixture(monkeypatch)

    assert cq.get_easy_matches("B") == []
    assert cq.get_easy_matches("B", is_very_high=True) == []

    potential = cq.get_potential_matches("B")
    assert potential == ["A_t"]

    numeric_df = cq.get_potential_numeric_target_df()
    assert list(numeric_df.columns) == ["C_t"]


def test_unrelated_and_no_potential_target_df(monkeypatch):
    cq, _source, _target = _make_quadrant_fixture(monkeypatch)

    # Unrelated columns live in the low/low quadrant (index 0).
    cq._quadrants = {
        "A": [
            [("T1", 0.1, 0.1), ("T1", 0.2, 0.2), ("T2", 0.1, 0.1)],
            [],
            [],
            [],
        ]
    }
    assert cq.get_unrelated_columns("A") == ["T1", "T2"]

    cq._quadrants = {"A": [[], [], [], []]}
    assert cq.get_potential_target_df("A") is None
