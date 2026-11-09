#!/usr/bin/env python3
"""Train and export a portable, uncalibrated lexical classifier. No test split used."""
from __future__ import annotations

import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import sys
import unicodedata
from collections import Counter, defaultdict
from datetime import datetime, timezone

os.environ.setdefault("OPENBLAS_NUM_THREADS", "1")
os.environ.setdefault("OMP_NUM_THREADS", "1")
os.environ.setdefault("MKL_NUM_THREADS", "1")
os.environ.setdefault("NUMEXPR_NUM_THREADS", "1")

import numpy as np
from scipy.sparse import csr_matrix
from sklearn.linear_model import SGDClassifier
import sklearn
import scipy

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data" / "synthetic" / "v1"
OUTPUT = ROOT / "data" / "model" / "v1"
FIELDS = (
    "use_purpose", "channels", "paid_advertising", "territories", "start_date",
    "duration_days", "max_impressions", "exclusivity", "modification_scope",
    "attribution", "sublicensing", "ai_use",
)
SCHEMA = "rightsreceipt-lexical-ovr-v1"
MODEL_ID = "rightsreceipt-synthetic-lexical"
MODEL_VERSION = "2026-10-26-v1"
FEATURE_LIMIT = 768
MIN_DOCUMENT_FREQUENCY = 2
TRAIN_RANDOM_STATE = 171017
ALPHA = 0.0003
ITERATIONS = 400


def sha256_bytes(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def stable_json(value: object) -> str:
    return json.dumps(value, sort_keys=True, ensure_ascii=False, separators=(",", ":"), allow_nan=False)


def read_dataset(name: str, manifest: dict) -> list[dict]:
    raw = (DATA / f"{name}.jsonl").read_bytes()
    entry = manifest["files"][f"{name}.jsonl"]
    if sha256_bytes(raw) != entry["sha256"] or len(raw) != entry["bytes"]:
        raise ValueError(f"{name} dataset digest/byte mismatch")
    rows = [json.loads(line) for line in raw.decode("utf-8").splitlines()]
    if len(rows) != entry["rows"] or not all(row["split"] == name for row in rows):
        raise ValueError(f"{name} record count or split mismatch")
    if not all([entry["fieldName"] for entry in row["fieldLabels"]] == list(FIELDS) for row in rows):
        raise ValueError("record field order mismatch")
    for row in rows:
        if sha256_bytes(row["inputText"].encode("utf-8")) != row["inputSha256"]:
            raise ValueError("record input hash mismatch")
    return rows


def features(text: str) -> set[str]:
    # This intentionally discards non-ASCII and accent distinctions. It is a limitation,
    # not an identity or licensing assertion. JS runtime uses the identical regex.
    tokens = re.findall(r"[a-z0-9]+", text.lower())
    result = {"u:" + token for token in tokens}
    result.update("b:" + a + "/" + b for a, b in zip(tokens, tokens[1:]))
    return result


def vocabulary_from_train(train: list[dict]) -> list[str]:
    df: Counter[str] = Counter()
    for row in train:
        df.update(features(row["inputText"]))
    return [key for key, count in sorted(df.items(), key=lambda pair: (-pair[1], pair[0]))
            if count >= MIN_DOCUMENT_FREQUENCY][:FEATURE_LIMIT]


def sparse_matrix(rows: list[dict], vocab: list[str]) -> csr_matrix:
    indices = {key: i for i, key in enumerate(vocab)}
    rr: list[int] = []
    cc: list[int] = []
    for index, row in enumerate(rows):
        for word in features(row["inputText"]):
            feature_index = indices.get(word)
            if feature_index is not None:
                rr.append(index)
                cc.append(feature_index)
    return csr_matrix((np.ones(len(rr), dtype=np.float64), (rr, cc)),
                      shape=(len(rows), len(vocab)), dtype=np.float64)


def encoded_label(field: dict) -> str:
    # For non-resolved classes preserve only their resolution status. Missing,
    # ambiguous, and low-confidence abstention are decided downstream.
    if field["resolutionState"] == "resolved":
        return "resolved:" + stable_json(field["normalizedValue"])
    return field["resolutionState"]


def json_label(code: str) -> dict:
    if code.startswith("resolved:"):
        return {"resolutionState": "resolved", "normalizedValue": json.loads(code[9:])}
    return {"resolutionState": code, "normalizedValue": None}


def to_int16_rows(coef: np.ndarray) -> tuple[list[float], list[int]]:
    scales: list[float] = []
    weights: list[int] = []
    for row in coef:
        maximum = float(np.abs(row).max())
        scale = maximum / 32760 if maximum else 1.0
        quantized = np.rint(row / scale).astype(np.int16)
        scales.append(scale)
        weights.extend(int(x) for x in quantized)
    return scales, weights


def train(output_dir: Path, *, check: bool = False) -> dict:
    manifest_raw = (DATA / "manifest.json").read_bytes()
    manifest = json.loads(manifest_raw)
    if manifest.get("taskContractVersion", "rights-extraction-v1") != "rights-extraction-v1":
        raise ValueError("incompatible dataset contract")
    train_rows = read_dataset("train", manifest)
    validation_rows = read_dataset("validation", manifest)
    if set(row["templateFamily"] for row in train_rows) & set(row["templateFamily"] for row in validation_rows):
        raise ValueError("overlapping template families")
    # Never load `test.jsonl` or inspect its gold labels here.
    vocab = vocabulary_from_train(train_rows)
    matrix = sparse_matrix(train_rows, vocab)
    valid_matrix = sparse_matrix(validation_rows, vocab)
    import base64
    all_weights: list[int] = []
    heads: list[dict] = []
    training_report: dict = {}
    for field_index, field in enumerate(FIELDS):
        train_labels = [encoded_label(row["fieldLabels"][field_index]) for row in train_rows]
        validation_labels = [encoded_label(row["fieldLabels"][field_index]) for row in validation_rows]
        classifier = SGDClassifier(
            loss="log_loss", penalty="l2", alpha=ALPHA, random_state=TRAIN_RANDOM_STATE,
            max_iter=ITERATIONS, tol=1e-6, shuffle=True, fit_intercept=True,
            learning_rate="optimal", average=False,
        )
        classifier.fit(matrix, train_labels)
        classes = list(classifier.classes_)
        if len(classes) < 3 or classifier.coef_.shape != (len(classes), len(vocab)):
            raise RuntimeError(f"Unexpected field head shape for {field}")
        scales, weights = to_int16_rows(classifier.coef_)
        offset = len(all_weights)
        all_weights.extend(weights)
        heads.append({
            "fieldName": field,
            "labels": [json_label(code) for code in classes],
            "intercepts": [float(x) for x in classifier.intercept_],
            "scales": scales,
            "offset": offset,
        })
        train_prediction = classifier.predict(matrix)
        valid_prediction = classifier.predict(valid_matrix)
        training_report[field] = {
            "classCount": len(classes),
            "trainExactLabelAgreement": int(np.sum(train_prediction == np.asarray(train_labels))),
            "trainCount": len(train_rows),
            "validationExactLabelAgreement": int(np.sum(valid_prediction == np.asarray(validation_labels))),
            "validationCount": len(validation_rows),
        }
    packed = np.asarray(all_weights, dtype="<i2").tobytes()
    encoded = base64.b64encode(packed).decode("ascii")
    artifact = {
        "schemaVersion": SCHEMA,
        "modelId": MODEL_ID,
        "modelVersion": MODEL_VERSION,
        "taskContractVersion": "rights-extraction-v1",
        "datasetManifestSha256": sha256_bytes(manifest_raw),
        "trainingFileSha256": manifest["files"]["train.jsonl"]["sha256"],
        "featureSpec": {"tokenPattern": "[a-z0-9]+", "binary": True, "orders": [1, 2], "maximum": FEATURE_LIMIT},
        "vocabulary": vocab,
        "heads": heads,
        "weightsEncoding": "int16-le-row-major-base64",
        "weightsBase64": encoded,
        "authority": {"modelOutputIsProposalOnly": True, "requiresSourceEvidence": True,
                      "requiresIndependentCalibration": True, "permittedActions": []},
    }
    artifact_bytes = (stable_json(artifact) + "\n").encode("utf-8")
    evidence = {
        "schemaVersion": "rightsreceipt-training-report-v1",
        "trainingArtifactSha256": sha256_bytes(artifact_bytes),
        "trainingDatasetSha256": manifest["files"]["train.jsonl"]["sha256"],
        "validationDatasetSha256": manifest["files"]["validation.jsonl"]["sha256"],
        "trainingScriptSha256": sha256_bytes(Path(__file__).read_bytes()),
        "runtime": {"python": sys.version.split()[0], "numpy": np.__version__,
                    "scipy": scipy.__version__, "sklearn": sklearn.__version__},
        "featureCount": len(vocab),
        "weightCount": len(all_weights),
        "fieldHeadCount": len(heads),
        "training": {"randomState": TRAIN_RANDOM_STATE, "alpha": ALPHA,
                     "maxIterations": ITERATIONS, "featureLimit": FEATURE_LIMIT,
                     "documentFrequencyMinimum": MIN_DOCUMENT_FREQUENCY},
        "results": training_report,
        "evaluationScope": "training_and_validation_only_no_heldout_tuning",
        "calibrationCompleted": False,
        "deploymentPrecisionEstablished": False,
    }
    evidence_bytes = (json.dumps(evidence, indent=2, sort_keys=True) + "\n").encode("utf-8")
    if check:
        if (output_dir / "artifact.json").read_bytes() != artifact_bytes:
            raise AssertionError("Model artifact does not reproduce byte-for-byte")
        if (output_dir / "training-report.json").read_bytes() != evidence_bytes:
            raise AssertionError("Training report does not reproduce byte-for-byte")
    else:
        output_dir.mkdir(parents=True, exist_ok=True)
        (output_dir / "artifact.json").write_bytes(artifact_bytes)
        (output_dir / "training-report.json").write_bytes(evidence_bytes)
    return evidence


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--check", action="store_true", help="Require exact match with existing committed artifact")
    parser.add_argument("--output", type=Path, default=OUTPUT)
    args = parser.parse_args()
    result = train(args.output, check=args.check)
    overall_train = sum(r["trainExactLabelAgreement"] for r in result["results"].values())
    overall_validation = sum(r["validationExactLabelAgreement"] for r in result["results"].values())
    print(f"model artifact {result['trainingArtifactSha256']} features={result['featureCount']} weights={result['weightCount']}")
    print(f"train field agreement {overall_train}/11520; validation {overall_validation}/2880; calibration not established")


if __name__ == "__main__":
    main()
