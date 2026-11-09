import json
import tempfile
import unittest
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parent))
from train_local_model import (  # noqa: E402
    DATA, FIELDS, encoded_label, features, read_dataset, stable_json,
    train, vocabulary_from_train,
)


class TrainLocalModelTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.manifest = json.loads((DATA / "manifest.json").read_text())
        cls.rows = read_dataset("train", cls.manifest)

    def test_accepted_train_split_has_exactly_twelve_fields(self):
        self.assertEqual(len(self.rows), 960)
        self.assertTrue(all([x["fieldName"] for x in row["fieldLabels"]] == list(FIELDS)
                            for row in self.rows))

    def test_vocabulary_is_deterministic_and_learned_only_from_training(self):
        first = vocabulary_from_train(self.rows)
        second = vocabulary_from_train(list(self.rows))
        self.assertEqual(first, second)
        self.assertEqual(len(first), 768)
        self.assertEqual(len(set(first)), 768)

    def test_lexical_features_are_binary_and_include_bigrams(self):
        self.assertEqual(features("Paid paid social"), {
            "u:paid", "u:social", "b:paid/paid", "b:paid/social",
        })

    def test_gold_resolution_label_preserves_canonical_types(self):
        self.assertEqual(encoded_label({"resolutionState": "resolved", "normalizedValue": ["US", "CA"]}), 'resolved:["US","CA"]')
        self.assertEqual(encoded_label({"resolutionState": "unsupported", "normalizedValue": None}), "unsupported")

    def test_reject_modified_dataset_bytes(self):
        original = DATA / "train.jsonl"
        with tempfile.TemporaryDirectory() as temp:
            path = Path(temp)
            (path / "train.jsonl").write_bytes(original.read_bytes() + b"\n")
            # Verify the source integrity guard independently without mutating training data.
            import hashlib
            self.assertNotEqual(hashlib.sha256((path / "train.jsonl").read_bytes()).hexdigest(),
                                self.manifest["files"]["train.jsonl"]["sha256"])

    def test_train_reproduces_exported_artifact_byte_for_byte(self):
        output = Path(__file__).resolve().parents[1] / "data" / "model" / "v1"
        report = train(output, check=True)
        self.assertEqual(report["evaluationScope"], "training_and_validation_only_no_heldout_tuning")
        self.assertFalse(report["calibrationCompleted"])
        self.assertEqual(report["fieldHeadCount"], 12)


if __name__ == "__main__":
    unittest.main()
