import test from "node:test";import assert from "node:assert/strict";import {evaluate,record} from "./rewards.mjs";
const base={answers:[{id:1,difficulty:"easy"},{id:2,difficulty:"hard"}],found:[1,2],wrong:0,hints:0,mode:"normal",remaining:40,cleared:true};
test("normal ignores time and rewards perfection",()=>{assert.equal(evaluate(base).score,3200);assert.equal(evaluate(base).stars,3)});
test("challenge adds remaining seconds",()=>assert.equal(evaluate({...base,mode:"challenge"}).score,3600));
test("hint and wrong remove bonuses, not base",()=>{const r=evaluate({...base,wrong:2,hints:1});assert.equal(r.score,2200);assert.equal(r.stars,2)});
test("incomplete and duplicates cannot grant clear rewards",()=>{const r=evaluate({...base,found:[1,1]});assert.equal(r.score,500);assert.equal(r.stars,0)});
test("record retains first and best, updates recent and stars",()=>{const a={score:100,stars:1,elapsed:10},b={score:90,stars:3,elapsed:20};const r=record(record(undefined,a),b);assert.equal(r.best,a);assert.equal(r.first,a);assert.equal(r.recent,b);assert.equal(r.maxStars,3)});
