#!/usr/bin/env python3
"""Reference math for packed int16 TS parity, sourced only from validation data."""
import base64
import hashlib
import json
from pathlib import Path
import re
import sys

BASE = Path(__file__).resolve().parents[1]
model_bytes=(BASE/"data/model/v1/artifact.json").read_bytes()
model=json.loads(model_bytes)
expected=model["trainingFileSha256"]
assert expected==hashlib.sha256((BASE/"data/synthetic/v1/train.jsonl").read_bytes()).hexdigest()
validation = [json.loads(x) for x in (BASE/"data/synthetic/v1/validation.jsonl").read_text().splitlines()]
selected=[]
for category in ["complete_supported", "negation", "unsupported", "contradiction", "injection", "unicode"]:
    row=next(x for x in validation if x["category"]==category)
    selected.append(row)
bytes_value=base64.b64decode(model["weightsBase64"],validate=True)
import struct
weights=struct.unpack("<"+"h"*(len(bytes_value)//2),bytes_value)
index={v:i for i,v in enumerate(model["vocabulary"])}
width=len(index)
result=[]
for row in selected:
    text=row["inputText"]
    tokens=re.findall(r"[a-z0-9]+",text.lower())
    feats={"u:"+t for t in tokens}
    feats.update("b:"+a+"/"+b for a,b in zip(tokens,tokens[1:]))
    indices=sorted(index[f] for f in feats if f in index)
    result_heads=[]
    for head in model["heads"]:
        scores=[]
        for class_i,intercept in enumerate(head["intercepts"]):
            score=intercept
            start=head["offset"]+class_i*width
            scale=head["scales"][class_i]
            for i in indices:
                score+=weights[start+i]*scale
            scores.append(score)
        best=max(range(len(scores)),key=lambda i:scores[i])
        runner=max((i for i in range(len(scores)) if i!=best),key=lambda i:scores[i])
        result_heads.append({"fieldName":head["fieldName"],"label":head["labels"][best],
                             "rawScore":scores[best],"runnerUpScore":scores[runner]})
    result.append({"exampleId":row["exampleId"],"inputText":text,"fields":result_heads})
output={"artifactSha256":hashlib.sha256(model_bytes).hexdigest(),"sourceSplit":"validation",
        "records":result}
path=BASE/"data/model/v1/reference-predictions.json"
path.write_text(json.dumps(output,sort_keys=True,separators=(',',':'),ensure_ascii=False)+'\n')
print('Reference predictions',len(result),'SHA256',hashlib.sha256(path.read_bytes()).hexdigest())
