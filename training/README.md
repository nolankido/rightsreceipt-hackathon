# RightsReceipt Local Model Training

The trainer reads only the versioned training and validation JSONL partitions from `data/synthetic/v1`. It does **not** open `test.jsonl`. Python is needed for training but not deployed TypeScript inference.

```bash
python -m pip install -r training/requirements-model.txt
python training/train_local_model.py --check
python -m unittest training/test_train_local_model.py
```

See [docs/model/LOCAL_MODEL_TRAINING.md](../docs/model/LOCAL_MODEL_TRAINING.md) for data boundaries, pinned versions, inference and safety limitations.
