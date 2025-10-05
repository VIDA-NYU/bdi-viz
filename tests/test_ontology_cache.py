import os

import pandas as pd


def test_compute_checksum_and_cache_roundtrip(tmp_path):
    # Lazy import to avoid side effects
    from api import utils

    # Redirect cache dir to tmp
    utils.ONTOLOGY_CACHE_DIR = str(tmp_path / "ontologies")

    # Create a simple dataframe
    df = pd.DataFrame({
        "A": [1, 2, 3],
        "B": ["x", "y", "z"],
    })

    checksum = utils.compute_dataframe_checksum(df)
    assert isinstance(checksum, str) and len(checksum) == 64

    # Write a dummy ontology and read it back
    ontology = {
        "A": {"column_name": "A", "category": "cat", "node": "node"},
        "B": {"column_name": "B", "category": "cat", "node": "node"},
    }

    utils.write_cached_ontology(ontology, checksum, "target")

    cached = utils.read_cached_ontology(checksum, "target")
    assert cached == ontology

    # Ensure file exists in redirected cache dir
    cache_file = os.path.join(utils.ONTOLOGY_CACHE_DIR, f"target_{checksum}.json")
    assert os.path.exists(cache_file)
