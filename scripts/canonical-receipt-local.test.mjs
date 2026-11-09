import assert from "node:assert/strict";
import { test } from "node:test";
import { canonicalHash, canonicalJson, parseCanonical, sha256Hex } from "../packages/receipts/src/canonical.ts";

test("RFC 8785 object sorting, nested values and primitive serialization",()=>{
 const input={numbers:[Number("333333333.33333329"),1e30,4.50,2e-3,1e-27],literals:[null,true,false],string:"€$\u000f\nA'B\"\\\\\"/"};
 assert.equal(canonicalJson(input),'{"literals":[null,true,false],"numbers":[333333333.3333333,1e+30,4.5,0.002,1e-27],"string":'+JSON.stringify(input.string)+'}');
});
test("UTF-16 key ordering, including integer-looking names, is deterministic",()=>{
 const x={"2":"two","10":"ten","€":"euro","😀":"emoji","\r":"cr","1":"one","דּ":"hebrew"};
 assert.equal(canonicalJson(x),'{"\\r":"cr","1":"one","10":"ten","2":"two","€":"euro","😀":"emoji","דּ":"hebrew"}');
});
test("object insertion order does not change a hash; array order does",async()=>{
 assert.equal(await canonicalHash({b:{z:2,a:1},a:3}),await canonicalHash({a:3,b:{a:1,z:2}}));
 assert.notEqual(await canonicalHash([1,2]),await canonicalHash([2,1]));
});
test("Unicode is preserved, not normalized",async()=>{
 assert.notEqual(await canonicalHash("é"),await canonicalHash("e\u0301"));
 assert.equal(canonicalJson("😀"),'"😀"');
});
test("native IEEE-754 JCS values include negative zero and exponent boundaries",()=>{
 assert.equal(canonicalJson([-0,Number.MIN_VALUE,Number.MAX_VALUE,1e20,1e21]),
 '[0,5e-324,1.7976931348623157e+308,100000000000000000000,1e+21]');
});
for(const [label,value] of [["NaN",NaN],["infinity",Infinity],["minus infinity",-Infinity],["undefined",undefined],
 ["big integer",1n],["function",()=>0],["symbol",Symbol("x")],["date object",new Date()],["map",new Map()],
 ["lone high surrogate","\ud800"],["lone low surrogate","\udfff"]]){
 test(`canonicalization rejects ${label}`,()=>assert.throws(()=>canonicalJson(value)));
}
test("undefined members and sparse arrays do not silently disappear",()=>{
 assert.throws(()=>canonicalJson({a:undefined}));assert.throws(()=>canonicalJson([undefined]));assert.throws(()=>canonicalJson(new Array(2)));
 const a=[];a.extra="x";assert.throws(()=>canonicalJson(a));
});
test("accessors, symbol keys and non-enumerable values are not executed or omitted",()=>{
 let ran=false;const x={get a(){ran=true;return 1;}};assert.throws(()=>canonicalJson(x));assert.equal(ran,false);
 assert.throws(()=>canonicalJson({[Symbol("secret")]:1}));
 assert.throws(()=>canonicalJson(Object.defineProperty({},"hidden",{value:1})));
});
test("cycles and excessive depth/size fail closed",()=>{
 const x={};x.self=x;assert.throws(()=>canonicalJson(x));
 let deep=0;for(let i=0;i<42;i++)deep=[deep];assert.throws(()=>canonicalJson(deep));
 assert.throws(()=>canonicalJson("x".repeat(262144)));
});
test("repeated noncyclic references are legal JSON values",()=>{
 const x={a:1};assert.equal(canonicalJson([x,x]),'[{"a":1},{"a":1}]');
});
test("raw canonical parser rejects duplicate keys, whitespace, alternative escape and number forms",()=>{
 for(const x of ['{"a":1,"a":1}',' {"a":1}','{"b":1,"a":2}','{"a":1.0}','{"a":"\\u0061"}'])assert.throws(()=>parseCanonical(x));
 assert.deepEqual(parseCanonical('{"a":1,"b":[true,null]}'),{a:1,b:[true,null]});
});
test("SHA-256 matches the standard abc vector",async()=>{
 assert.equal(await sha256Hex("abc"),"ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});
