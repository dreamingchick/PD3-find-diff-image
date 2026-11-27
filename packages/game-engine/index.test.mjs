import test from "node:test";import assert from "node:assert/strict";import {answers,judge,contains,clampView,zoomView,imagePoint} from "./index.mjs";
test("five distinct sample targets",()=>{assert.equal(answers.length,5);for(const a of answers)assert.deepEqual(judge(a.x,a.y,[]),{kind:"correct",id:a.id});});
test("duplicate, miss, invalid",()=>{assert.equal(judge(.5,.32,[1]).kind,"duplicate");assert.equal(judge(0,0,[]).kind,"wrong");assert.equal(judge(NaN,0,[]).kind,"invalid");});
test("rectangle edges",()=>{const b={shape:"rect",x:.2,y:.2,w:.3,h:.3};assert.ok(contains(.2,.5,b));assert.ok(!contains(.1,.3,b));});
test("polygon edges and exterior",()=>{const b={shape:"polygon",points:[[0,0],[1,0],[0,1]]};assert.ok(contains(.2,.2,b));assert.ok(contains(.5,.5,b));assert.ok(!contains(.8,.8,b));});
test("side-specific same ID",()=>{const a={id:9,hitboxes:[{x:.2,y:.2,r:.1},{x:.8,y:.8,r:.1}]};assert.equal(judge(.2,.2,[],[a],0).id,9);assert.equal(judge(.8,.8,[9],[a],1).kind,"duplicate");assert.equal(judge(.2,.2,[],[a],1).kind,"wrong");});
test("ambiguous overlap rejected",()=>{assert.equal(judge(.5,.32,[],[answers[0],{...answers[0],id:8}]).kind,"invalid");});
test("zoom anchored point",()=>{const v=zoomView({z:1,x:0,y:0},2,.3,.7);const p=imagePoint(v,.3,.7);assert.ok(Math.abs(p.x-.3)<1e-12&&Math.abs(p.y-.7)<1e-12);});
test("view bounds and reset",()=>{assert.deepEqual(clampView({z:2,x:1,y:-4}),{z:2,x:0,y:-1});assert.deepEqual(zoomView({z:2,x:-.5,y:-.5},1),{z:1,x:0,y:0});});
