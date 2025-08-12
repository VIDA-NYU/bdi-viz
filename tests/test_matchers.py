from api.matcher.bdikit import BDIKitMatcher
from api.matcher.difflib import DiffLibMatcher
from api.matcher.valentine import ValentineMatcher
from api.matcher.magneto import MagnetoMatcher
from api.matcher.rapidfuzz import RapidFuzzMatcher
from api.matcher.rapidfuzz_value import RapidFuzzValueMatcher


class TestMatchers:
    def test_bdikit_matcher(self, sample_source_csv, sample_target_csv):
        """
        Test the BDIKitMatcher.
        """
        matcher = BDIKitMatcher("magneto_ft")
        matches = matcher.top_matches(sample_source_csv, sample_target_csv)
        assert len(matches) > 0

        matcher = BDIKitMatcher("magneto_zs")
        matches = matcher.top_matches(sample_source_csv, sample_target_csv)
        assert len(matches) > 0

        matcher = BDIKitMatcher("magneto_zs_bp")
        matches = matcher.top_value_matches(
            sample_source_csv["Age"], sample_target_csv["age"]
        )
        assert len(matches) > 0

    def test_difflib_matcher(self, sample_source_csv, sample_target_csv):
        """
        Test the DiffLibMatcher. Only applicable for value matching.
        """
        matcher = DiffLibMatcher("difflib")
        matches = matcher.top_value_matches(
            sample_source_csv["Age"], sample_target_csv["age"]
        )
        assert len(matches) > 0

    def test_valentine_matcher(self, sample_source_csv, sample_target_csv):
        """
        Test the ValentineMatcher.
        """
        matcher = ValentineMatcher("coma")
        matches = matcher.top_matches(sample_source_csv, sample_target_csv)
        assert len(matches) > 0

        # matcher = ValentineMatcher("cupid")
        # matches = matcher.top_matches(sample_source_csv, sample_target_csv)
        # assert len(matches) > 0

        matcher = ValentineMatcher("similarity_flooding")
        matches = matcher.top_matches(sample_source_csv, sample_target_csv)
        assert len(matches) > 0

        matcher = ValentineMatcher("jaccard_distance_matcher")
        matches = matcher.top_matches(sample_source_csv, sample_target_csv)
        assert len(matches) > 0

        matcher = ValentineMatcher("distribution_based")
        matches = matcher.top_matches(sample_source_csv, sample_target_csv)
        assert len(matches) > 0

    def test_magneto_matcher(self, sample_source_csv, sample_target_csv):
        """
        Test the MagnetoMatcher.
        """
        matcher = MagnetoMatcher("magneto_zs")
        matches = matcher.top_matches(sample_source_csv, sample_target_csv)
        assert len(matches) > 0

        matcher = MagnetoMatcher("magneto_ft")
        matches = matcher.top_matches(sample_source_csv, sample_target_csv)
        assert len(matches) > 0

    def test_rapidfuzz_matcher(self, sample_source_csv, sample_target_csv):
        """
        Test the RapidFuzzMatcher.
        """
        matcher = RapidFuzzMatcher("rapidfuzz")
        matches = matcher.top_matches(sample_source_csv, sample_target_csv)
        assert len(matches) > 0

    def test_rapidfuzz_value_matcher(self, sample_source_csv, sample_target_csv):
        """
        Test the RapidFuzzValueMatcher. Note that this matcher use value scores
        to generate attribute matching score used by candidate quadrants.
        """
        matcher = RapidFuzzValueMatcher("rapidfuzz_value")
        matches = matcher.top_matches(sample_source_csv, sample_target_csv)
        assert len(matches) > 0

        value_matches = matcher.top_value_matches(
            sample_source_csv["Age"], sample_target_csv["age"]
        )
        assert len(value_matches) > 0

        value_matches = matcher.top_value_matches(
            sample_source_csv["AJCC_Path_pT"], sample_target_csv["ajcc_pathologic_t"]
        )
        assert len(value_matches) > 0

        value_matches = matcher.top_value_matches(
            sample_source_csv["Is_Obfuscated"], sample_target_csv["age_is_obfuscated"]
        )
        assert len(value_matches) > 0
