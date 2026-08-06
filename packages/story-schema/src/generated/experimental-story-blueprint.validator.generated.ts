// @ts-nocheck -- Ajv standalone output is generated JavaScript compiled by tsc.
/* 由 scripts/generate-artifacts.mjs 确定性生成；请勿手工修改。 */
"use strict";
export const validate = validate20;
export default validate20;
const schema31 = {"$schema":"https://json-schema.org/draft/2020-12/schema","$id":"urn:datapulse:story-blueprint:experimental:0.1.0","title":"DataPulse AI 实验 StoryBlueprint 0.1.0","description":"仅供 M0-011～M0-013 开发样本使用；M0-048 前不是正式兼容承诺。","type":"object","additionalProperties":false,"required":["schemaVersion","storyId","datasetVersionId","reportGoal","storyTimezone","references","conditions","globalConditionIds","theme","visual","blocks"],"properties":{"schemaVersion":{"const":"0.1.0"},"storyId":{"$ref":"#/$defs/storyId"},"datasetVersionId":{"$ref":"#/$defs/datasetVersionId"},"reportGoal":{"type":"string","minLength":1,"maxLength":1000},"storyTimezone":{"type":"string","minLength":3,"maxLength":64,"pattern":"^(?:UTC|[A-Za-z_]+(?:/[A-Za-z0-9_+.-]+)+)$"},"references":{"$ref":"#/$defs/referenceCatalog"},"conditions":{"type":"array","maxItems":64,"items":{"$ref":"#/$defs/analysisCondition"}},"globalConditionIds":{"$ref":"#/$defs/analysisConditionIdList"},"theme":{"$ref":"#/$defs/theme"},"visual":{"$ref":"#/$defs/storyVisual"},"blocks":{"type":"array","minItems":1,"maxItems":64,"items":{"$ref":"#/$defs/storyBlock"}}},"$defs":{"storyId":{"type":"string","minLength":7,"maxLength":70,"pattern":"^story_[a-z0-9]+(?:-[a-z0-9]+)*$"},"datasetVersionId":{"type":"string","minLength":17,"maxLength":80,"pattern":"^dataset_version_[a-z0-9]+(?:-[a-z0-9]+)*$"},"fieldId":{"type":"string","minLength":7,"maxLength":70,"pattern":"^field_[a-z0-9]+(?:-[a-z0-9]+)*$"},"storyBlockId":{"type":"string","minLength":13,"maxLength":76,"pattern":"^story_block_[a-z0-9]+(?:-[a-z0-9]+)*$"},"analysisConditionId":{"type":"string","minLength":20,"maxLength":83,"pattern":"^analysis_condition_[a-z0-9]+(?:-[a-z0-9]+)*$"},"metricId":{"type":"string","minLength":8,"maxLength":71,"pattern":"^metric_[a-z0-9]+(?:-[a-z0-9]+)*$"},"evidenceId":{"type":"string","minLength":10,"maxLength":73,"pattern":"^evidence_[a-z0-9]+(?:-[a-z0-9]+)*$"},"judgmentRuleId":{"type":"string","minLength":15,"maxLength":78,"pattern":"^judgment_rule_[a-z0-9]+(?:-[a-z0-9]+)*$"},"narrativeRuleId":{"type":"string","minLength":16,"maxLength":79,"pattern":"^narrative_rule_[a-z0-9]+(?:-[a-z0-9]+)*$"},"fieldIdList":{"type":"array","maxItems":256,"uniqueItems":true,"items":{"$ref":"#/$defs/fieldId"}},"metricIdList":{"type":"array","maxItems":256,"uniqueItems":true,"items":{"$ref":"#/$defs/metricId"}},"evidenceIdList":{"type":"array","maxItems":256,"uniqueItems":true,"items":{"$ref":"#/$defs/evidenceId"}},"judgmentRuleIdList":{"type":"array","maxItems":256,"uniqueItems":true,"items":{"$ref":"#/$defs/judgmentRuleId"}},"narrativeRuleIdList":{"type":"array","maxItems":256,"uniqueItems":true,"items":{"$ref":"#/$defs/narrativeRuleId"}},"analysisConditionIdList":{"type":"array","maxItems":64,"uniqueItems":true,"items":{"$ref":"#/$defs/analysisConditionId"}},"referenceCatalog":{"type":"object","additionalProperties":false,"required":["fieldIds","metricIds","evidenceIds","judgmentRuleIds","narrativeRuleIds"],"properties":{"fieldIds":{"$ref":"#/$defs/fieldIdList"},"metricIds":{"$ref":"#/$defs/metricIdList"},"evidenceIds":{"$ref":"#/$defs/evidenceIdList"},"judgmentRuleIds":{"$ref":"#/$defs/judgmentRuleIdList"},"narrativeRuleIds":{"$ref":"#/$defs/narrativeRuleIdList"}}},"timeRangeCondition":{"type":"object","additionalProperties":false,"required":["conditionId","kind","fieldId","start","end"],"properties":{"conditionId":{"$ref":"#/$defs/analysisConditionId"},"kind":{"const":"time-range"},"fieldId":{"$ref":"#/$defs/fieldId"},"start":{"type":"string","minLength":10,"maxLength":64,"pattern":"^\\d{4}-\\d{2}-\\d{2}(?:T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{1,9})?(?:Z|[+-]\\d{2}:\\d{2}))?$"},"end":{"type":"string","minLength":10,"maxLength":64,"pattern":"^\\d{4}-\\d{2}-\\d{2}(?:T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{1,9})?(?:Z|[+-]\\d{2}:\\d{2}))?$"}}},"categoryConditionValue":{"oneOf":[{"type":"string","minLength":1,"maxLength":256},{"type":"number"},{"type":"boolean"}]},"categoryCondition":{"type":"object","additionalProperties":false,"required":["conditionId","kind","fieldId","values","includeMissing"],"properties":{"conditionId":{"$ref":"#/$defs/analysisConditionId"},"kind":{"const":"category-in"},"fieldId":{"$ref":"#/$defs/fieldId"},"values":{"type":"array","minItems":1,"maxItems":64,"uniqueItems":true,"items":{"$ref":"#/$defs/categoryConditionValue"}},"includeMissing":{"type":"boolean"}}},"numberRangeCondition":{"type":"object","additionalProperties":false,"required":["conditionId","kind","fieldId"],"properties":{"conditionId":{"$ref":"#/$defs/analysisConditionId"},"kind":{"const":"number-range"},"fieldId":{"$ref":"#/$defs/fieldId"},"minimum":{"type":"number"},"maximum":{"type":"number"}},"anyOf":[{"required":["minimum"],"properties":{"minimum":{"type":"number"}}},{"required":["maximum"],"properties":{"maximum":{"type":"number"}}}]},"analysisCondition":{"oneOf":[{"$ref":"#/$defs/timeRangeCondition"},{"$ref":"#/$defs/categoryCondition"},{"$ref":"#/$defs/numberRangeCondition"}]},"theme":{"type":"object","additionalProperties":false,"required":["themeId"],"properties":{"themeId":{"enum":["deep-space-neon","soft-glass","data-editorial","enterprise-minimal"]}}},"storyVisual":{"type":"object","additionalProperties":false,"required":["renderMode","scenePreset","motionPreset"],"properties":{"renderMode":{"const":"2d"},"scenePreset":{"const":"none"},"motionPreset":{"const":"none"}}},"blockLayout":{"type":"object","additionalProperties":false,"required":["variant"],"properties":{"variant":{"enum":["full-width","split-left","split-right","emphasis"]}}},"titleSummaryBlock":{"type":"object","additionalProperties":false,"required":["blockId","blockType","layout","additionalConditionIds","evidenceIds","judgmentRuleIds","narrativeRuleIds","content","visualVariant"],"properties":{"blockId":{"$ref":"#/$defs/storyBlockId"},"blockType":{"const":"title-summary"},"layout":{"$ref":"#/$defs/blockLayout"},"additionalConditionIds":{"$ref":"#/$defs/analysisConditionIdList"},"evidenceIds":{"$ref":"#/$defs/evidenceIdList"},"judgmentRuleIds":{"$ref":"#/$defs/judgmentRuleIdList"},"narrativeRuleIds":{"$ref":"#/$defs/narrativeRuleIdList"},"content":{"type":"object","additionalProperties":false,"required":["title","summary"],"properties":{"title":{"type":"string","minLength":1,"maxLength":160},"summary":{"type":"string","minLength":1,"maxLength":4000}}},"visualVariant":{"enum":["hero","plain"]}}},"kpiBlock":{"type":"object","additionalProperties":false,"required":["blockId","blockType","layout","additionalConditionIds","metricId","evidenceIds","judgmentRuleIds","narrativeRuleIds","label","visualVariant"],"properties":{"blockId":{"$ref":"#/$defs/storyBlockId"},"blockType":{"const":"kpi"},"layout":{"$ref":"#/$defs/blockLayout"},"additionalConditionIds":{"$ref":"#/$defs/analysisConditionIdList"},"metricId":{"$ref":"#/$defs/metricId"},"evidenceIds":{"type":"array","minItems":1,"maxItems":256,"uniqueItems":true,"items":{"$ref":"#/$defs/evidenceId"}},"judgmentRuleIds":{"$ref":"#/$defs/judgmentRuleIdList"},"narrativeRuleIds":{"$ref":"#/$defs/narrativeRuleIdList"},"label":{"type":"string","minLength":1,"maxLength":160},"visualVariant":{"enum":["metric-card","metric-feature"]}}},"storyBlock":{"oneOf":[{"$ref":"#/$defs/titleSummaryBlock"},{"$ref":"#/$defs/kpiBlock"}]}}};
const schema32 = {"type":"string","minLength":7,"maxLength":70,"pattern":"^story_[a-z0-9]+(?:-[a-z0-9]+)*$"};
const schema33 = {"type":"string","minLength":17,"maxLength":80,"pattern":"^dataset_version_[a-z0-9]+(?:-[a-z0-9]+)*$"};
const schema58 = {"type":"object","additionalProperties":false,"required":["themeId"],"properties":{"themeId":{"enum":["deep-space-neon","soft-glass","data-editorial","enterprise-minimal"]}}};
const schema59 = {"type":"object","additionalProperties":false,"required":["renderMode","scenePreset","motionPreset"],"properties":{"renderMode":{"const":"2d"},"scenePreset":{"const":"none"},"motionPreset":{"const":"none"}}};
const func1 = Object.prototype.hasOwnProperty;
import func2Module from "ajv/dist/runtime/ucs2length.js";
const func2 = func2Module.default ?? func2Module;
const pattern4 = new RegExp("^story_[a-z0-9]+(?:-[a-z0-9]+)*$", "u");
const pattern5 = new RegExp("^dataset_version_[a-z0-9]+(?:-[a-z0-9]+)*$", "u");
const pattern6 = new RegExp("^(?:UTC|[A-Za-z_]+(?:/[A-Za-z0-9_+.-]+)+)$", "u");
const schema34 = {"type":"object","additionalProperties":false,"required":["fieldIds","metricIds","evidenceIds","judgmentRuleIds","narrativeRuleIds"],"properties":{"fieldIds":{"$ref":"#/$defs/fieldIdList"},"metricIds":{"$ref":"#/$defs/metricIdList"},"evidenceIds":{"$ref":"#/$defs/evidenceIdList"},"judgmentRuleIds":{"$ref":"#/$defs/judgmentRuleIdList"},"narrativeRuleIds":{"$ref":"#/$defs/narrativeRuleIdList"}}};
const schema35 = {"type":"array","maxItems":256,"uniqueItems":true,"items":{"$ref":"#/$defs/fieldId"}};
const schema36 = {"type":"string","minLength":7,"maxLength":70,"pattern":"^field_[a-z0-9]+(?:-[a-z0-9]+)*$"};
import func0Module from "ajv/dist/runtime/equal.js";
const func0 = func0Module.default ?? func0Module;
const pattern7 = new RegExp("^field_[a-z0-9]+(?:-[a-z0-9]+)*$", "u");

function validate22(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate22.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(errors === 0){
if(Array.isArray(data)){
if(data.length > 256){
validate22.errors = [{instancePath,schemaPath:"#/maxItems",keyword:"maxItems",params:{limit: 256},message:"must NOT have more than 256 items"}];
return false;
}
else {
var valid0 = true;
const len0 = data.length;
for(let i0=0; i0<len0; i0++){
let data0 = data[i0];
const _errs1 = errors;
const _errs2 = errors;
if(errors === _errs2){
if(typeof data0 === "string"){
if(func2(data0) > 70){
validate22.errors = [{instancePath:instancePath+"/" + i0,schemaPath:"#/$defs/fieldId/maxLength",keyword:"maxLength",params:{limit: 70},message:"must NOT have more than 70 characters"}];
return false;
}
else {
if(func2(data0) < 7){
validate22.errors = [{instancePath:instancePath+"/" + i0,schemaPath:"#/$defs/fieldId/minLength",keyword:"minLength",params:{limit: 7},message:"must NOT have fewer than 7 characters"}];
return false;
}
else {
if(!pattern7.test(data0)){
validate22.errors = [{instancePath:instancePath+"/" + i0,schemaPath:"#/$defs/fieldId/pattern",keyword:"pattern",params:{pattern: "^field_[a-z0-9]+(?:-[a-z0-9]+)*$"},message:"must match pattern \""+"^field_[a-z0-9]+(?:-[a-z0-9]+)*$"+"\""}];
return false;
}
}
}
}
else {
validate22.errors = [{instancePath:instancePath+"/" + i0,schemaPath:"#/$defs/fieldId/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
}
var valid0 = _errs1 === errors;
if(!valid0){
break;
}
}
if(valid0){
let i1 = data.length;
let j0;
if(i1 > 1){
outer0:
for(;i1--;){
for(j0 = i1; j0--;){
if(func0(data[i1], data[j0])){
validate22.errors = [{instancePath,schemaPath:"#/uniqueItems",keyword:"uniqueItems",params:{i: i1, j: j0},message:"must NOT have duplicate items (items ## "+j0+" and "+i1+" are identical)"}];
return false;
break outer0;
}
}
}
}
}
}
}
else {
validate22.errors = [{instancePath,schemaPath:"#/type",keyword:"type",params:{type: "array"},message:"must be array"}];
return false;
}
}
validate22.errors = vErrors;
return errors === 0;
}
validate22.evaluated = {"items":true,"dynamicProps":false,"dynamicItems":false};

const schema37 = {"type":"array","maxItems":256,"uniqueItems":true,"items":{"$ref":"#/$defs/metricId"}};
const schema38 = {"type":"string","minLength":8,"maxLength":71,"pattern":"^metric_[a-z0-9]+(?:-[a-z0-9]+)*$"};
const pattern8 = new RegExp("^metric_[a-z0-9]+(?:-[a-z0-9]+)*$", "u");

function validate24(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate24.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(errors === 0){
if(Array.isArray(data)){
if(data.length > 256){
validate24.errors = [{instancePath,schemaPath:"#/maxItems",keyword:"maxItems",params:{limit: 256},message:"must NOT have more than 256 items"}];
return false;
}
else {
var valid0 = true;
const len0 = data.length;
for(let i0=0; i0<len0; i0++){
let data0 = data[i0];
const _errs1 = errors;
const _errs2 = errors;
if(errors === _errs2){
if(typeof data0 === "string"){
if(func2(data0) > 71){
validate24.errors = [{instancePath:instancePath+"/" + i0,schemaPath:"#/$defs/metricId/maxLength",keyword:"maxLength",params:{limit: 71},message:"must NOT have more than 71 characters"}];
return false;
}
else {
if(func2(data0) < 8){
validate24.errors = [{instancePath:instancePath+"/" + i0,schemaPath:"#/$defs/metricId/minLength",keyword:"minLength",params:{limit: 8},message:"must NOT have fewer than 8 characters"}];
return false;
}
else {
if(!pattern8.test(data0)){
validate24.errors = [{instancePath:instancePath+"/" + i0,schemaPath:"#/$defs/metricId/pattern",keyword:"pattern",params:{pattern: "^metric_[a-z0-9]+(?:-[a-z0-9]+)*$"},message:"must match pattern \""+"^metric_[a-z0-9]+(?:-[a-z0-9]+)*$"+"\""}];
return false;
}
}
}
}
else {
validate24.errors = [{instancePath:instancePath+"/" + i0,schemaPath:"#/$defs/metricId/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
}
var valid0 = _errs1 === errors;
if(!valid0){
break;
}
}
if(valid0){
let i1 = data.length;
let j0;
if(i1 > 1){
outer0:
for(;i1--;){
for(j0 = i1; j0--;){
if(func0(data[i1], data[j0])){
validate24.errors = [{instancePath,schemaPath:"#/uniqueItems",keyword:"uniqueItems",params:{i: i1, j: j0},message:"must NOT have duplicate items (items ## "+j0+" and "+i1+" are identical)"}];
return false;
break outer0;
}
}
}
}
}
}
}
else {
validate24.errors = [{instancePath,schemaPath:"#/type",keyword:"type",params:{type: "array"},message:"must be array"}];
return false;
}
}
validate24.errors = vErrors;
return errors === 0;
}
validate24.evaluated = {"items":true,"dynamicProps":false,"dynamicItems":false};

const schema39 = {"type":"array","maxItems":256,"uniqueItems":true,"items":{"$ref":"#/$defs/evidenceId"}};
const schema40 = {"type":"string","minLength":10,"maxLength":73,"pattern":"^evidence_[a-z0-9]+(?:-[a-z0-9]+)*$"};
const pattern9 = new RegExp("^evidence_[a-z0-9]+(?:-[a-z0-9]+)*$", "u");

function validate26(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate26.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(errors === 0){
if(Array.isArray(data)){
if(data.length > 256){
validate26.errors = [{instancePath,schemaPath:"#/maxItems",keyword:"maxItems",params:{limit: 256},message:"must NOT have more than 256 items"}];
return false;
}
else {
var valid0 = true;
const len0 = data.length;
for(let i0=0; i0<len0; i0++){
let data0 = data[i0];
const _errs1 = errors;
const _errs2 = errors;
if(errors === _errs2){
if(typeof data0 === "string"){
if(func2(data0) > 73){
validate26.errors = [{instancePath:instancePath+"/" + i0,schemaPath:"#/$defs/evidenceId/maxLength",keyword:"maxLength",params:{limit: 73},message:"must NOT have more than 73 characters"}];
return false;
}
else {
if(func2(data0) < 10){
validate26.errors = [{instancePath:instancePath+"/" + i0,schemaPath:"#/$defs/evidenceId/minLength",keyword:"minLength",params:{limit: 10},message:"must NOT have fewer than 10 characters"}];
return false;
}
else {
if(!pattern9.test(data0)){
validate26.errors = [{instancePath:instancePath+"/" + i0,schemaPath:"#/$defs/evidenceId/pattern",keyword:"pattern",params:{pattern: "^evidence_[a-z0-9]+(?:-[a-z0-9]+)*$"},message:"must match pattern \""+"^evidence_[a-z0-9]+(?:-[a-z0-9]+)*$"+"\""}];
return false;
}
}
}
}
else {
validate26.errors = [{instancePath:instancePath+"/" + i0,schemaPath:"#/$defs/evidenceId/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
}
var valid0 = _errs1 === errors;
if(!valid0){
break;
}
}
if(valid0){
let i1 = data.length;
let j0;
if(i1 > 1){
outer0:
for(;i1--;){
for(j0 = i1; j0--;){
if(func0(data[i1], data[j0])){
validate26.errors = [{instancePath,schemaPath:"#/uniqueItems",keyword:"uniqueItems",params:{i: i1, j: j0},message:"must NOT have duplicate items (items ## "+j0+" and "+i1+" are identical)"}];
return false;
break outer0;
}
}
}
}
}
}
}
else {
validate26.errors = [{instancePath,schemaPath:"#/type",keyword:"type",params:{type: "array"},message:"must be array"}];
return false;
}
}
validate26.errors = vErrors;
return errors === 0;
}
validate26.evaluated = {"items":true,"dynamicProps":false,"dynamicItems":false};

const schema41 = {"type":"array","maxItems":256,"uniqueItems":true,"items":{"$ref":"#/$defs/judgmentRuleId"}};
const schema42 = {"type":"string","minLength":15,"maxLength":78,"pattern":"^judgment_rule_[a-z0-9]+(?:-[a-z0-9]+)*$"};
const pattern10 = new RegExp("^judgment_rule_[a-z0-9]+(?:-[a-z0-9]+)*$", "u");

function validate28(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate28.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(errors === 0){
if(Array.isArray(data)){
if(data.length > 256){
validate28.errors = [{instancePath,schemaPath:"#/maxItems",keyword:"maxItems",params:{limit: 256},message:"must NOT have more than 256 items"}];
return false;
}
else {
var valid0 = true;
const len0 = data.length;
for(let i0=0; i0<len0; i0++){
let data0 = data[i0];
const _errs1 = errors;
const _errs2 = errors;
if(errors === _errs2){
if(typeof data0 === "string"){
if(func2(data0) > 78){
validate28.errors = [{instancePath:instancePath+"/" + i0,schemaPath:"#/$defs/judgmentRuleId/maxLength",keyword:"maxLength",params:{limit: 78},message:"must NOT have more than 78 characters"}];
return false;
}
else {
if(func2(data0) < 15){
validate28.errors = [{instancePath:instancePath+"/" + i0,schemaPath:"#/$defs/judgmentRuleId/minLength",keyword:"minLength",params:{limit: 15},message:"must NOT have fewer than 15 characters"}];
return false;
}
else {
if(!pattern10.test(data0)){
validate28.errors = [{instancePath:instancePath+"/" + i0,schemaPath:"#/$defs/judgmentRuleId/pattern",keyword:"pattern",params:{pattern: "^judgment_rule_[a-z0-9]+(?:-[a-z0-9]+)*$"},message:"must match pattern \""+"^judgment_rule_[a-z0-9]+(?:-[a-z0-9]+)*$"+"\""}];
return false;
}
}
}
}
else {
validate28.errors = [{instancePath:instancePath+"/" + i0,schemaPath:"#/$defs/judgmentRuleId/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
}
var valid0 = _errs1 === errors;
if(!valid0){
break;
}
}
if(valid0){
let i1 = data.length;
let j0;
if(i1 > 1){
outer0:
for(;i1--;){
for(j0 = i1; j0--;){
if(func0(data[i1], data[j0])){
validate28.errors = [{instancePath,schemaPath:"#/uniqueItems",keyword:"uniqueItems",params:{i: i1, j: j0},message:"must NOT have duplicate items (items ## "+j0+" and "+i1+" are identical)"}];
return false;
break outer0;
}
}
}
}
}
}
}
else {
validate28.errors = [{instancePath,schemaPath:"#/type",keyword:"type",params:{type: "array"},message:"must be array"}];
return false;
}
}
validate28.errors = vErrors;
return errors === 0;
}
validate28.evaluated = {"items":true,"dynamicProps":false,"dynamicItems":false};

const schema43 = {"type":"array","maxItems":256,"uniqueItems":true,"items":{"$ref":"#/$defs/narrativeRuleId"}};
const schema44 = {"type":"string","minLength":16,"maxLength":79,"pattern":"^narrative_rule_[a-z0-9]+(?:-[a-z0-9]+)*$"};
const pattern11 = new RegExp("^narrative_rule_[a-z0-9]+(?:-[a-z0-9]+)*$", "u");

function validate30(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate30.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(errors === 0){
if(Array.isArray(data)){
if(data.length > 256){
validate30.errors = [{instancePath,schemaPath:"#/maxItems",keyword:"maxItems",params:{limit: 256},message:"must NOT have more than 256 items"}];
return false;
}
else {
var valid0 = true;
const len0 = data.length;
for(let i0=0; i0<len0; i0++){
let data0 = data[i0];
const _errs1 = errors;
const _errs2 = errors;
if(errors === _errs2){
if(typeof data0 === "string"){
if(func2(data0) > 79){
validate30.errors = [{instancePath:instancePath+"/" + i0,schemaPath:"#/$defs/narrativeRuleId/maxLength",keyword:"maxLength",params:{limit: 79},message:"must NOT have more than 79 characters"}];
return false;
}
else {
if(func2(data0) < 16){
validate30.errors = [{instancePath:instancePath+"/" + i0,schemaPath:"#/$defs/narrativeRuleId/minLength",keyword:"minLength",params:{limit: 16},message:"must NOT have fewer than 16 characters"}];
return false;
}
else {
if(!pattern11.test(data0)){
validate30.errors = [{instancePath:instancePath+"/" + i0,schemaPath:"#/$defs/narrativeRuleId/pattern",keyword:"pattern",params:{pattern: "^narrative_rule_[a-z0-9]+(?:-[a-z0-9]+)*$"},message:"must match pattern \""+"^narrative_rule_[a-z0-9]+(?:-[a-z0-9]+)*$"+"\""}];
return false;
}
}
}
}
else {
validate30.errors = [{instancePath:instancePath+"/" + i0,schemaPath:"#/$defs/narrativeRuleId/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
}
var valid0 = _errs1 === errors;
if(!valid0){
break;
}
}
if(valid0){
let i1 = data.length;
let j0;
if(i1 > 1){
outer0:
for(;i1--;){
for(j0 = i1; j0--;){
if(func0(data[i1], data[j0])){
validate30.errors = [{instancePath,schemaPath:"#/uniqueItems",keyword:"uniqueItems",params:{i: i1, j: j0},message:"must NOT have duplicate items (items ## "+j0+" and "+i1+" are identical)"}];
return false;
break outer0;
}
}
}
}
}
}
}
else {
validate30.errors = [{instancePath,schemaPath:"#/type",keyword:"type",params:{type: "array"},message:"must be array"}];
return false;
}
}
validate30.errors = vErrors;
return errors === 0;
}
validate30.evaluated = {"items":true,"dynamicProps":false,"dynamicItems":false};


function validate21(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate21.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(errors === 0){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing0;
if((((((data.fieldIds === undefined) && (missing0 = "fieldIds")) || ((data.metricIds === undefined) && (missing0 = "metricIds"))) || ((data.evidenceIds === undefined) && (missing0 = "evidenceIds"))) || ((data.judgmentRuleIds === undefined) && (missing0 = "judgmentRuleIds"))) || ((data.narrativeRuleIds === undefined) && (missing0 = "narrativeRuleIds"))){
validate21.errors = [{instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: missing0},message:"must have required property '"+missing0+"'"}];
return false;
}
else {
const _errs1 = errors;
for(const key0 in data){
if(!(((((key0 === "fieldIds") || (key0 === "metricIds")) || (key0 === "evidenceIds")) || (key0 === "judgmentRuleIds")) || (key0 === "narrativeRuleIds"))){
validate21.errors = [{instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"}];
return false;
break;
}
}
if(_errs1 === errors){
if(data.fieldIds !== undefined){
const _errs2 = errors;
if(!(validate22(data.fieldIds, {instancePath:instancePath+"/fieldIds",parentData:data,parentDataProperty:"fieldIds",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate22.errors : vErrors.concat(validate22.errors);
errors = vErrors.length;
}
var valid0 = _errs2 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.metricIds !== undefined){
const _errs3 = errors;
if(!(validate24(data.metricIds, {instancePath:instancePath+"/metricIds",parentData:data,parentDataProperty:"metricIds",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate24.errors : vErrors.concat(validate24.errors);
errors = vErrors.length;
}
var valid0 = _errs3 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.evidenceIds !== undefined){
const _errs4 = errors;
if(!(validate26(data.evidenceIds, {instancePath:instancePath+"/evidenceIds",parentData:data,parentDataProperty:"evidenceIds",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate26.errors : vErrors.concat(validate26.errors);
errors = vErrors.length;
}
var valid0 = _errs4 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.judgmentRuleIds !== undefined){
const _errs5 = errors;
if(!(validate28(data.judgmentRuleIds, {instancePath:instancePath+"/judgmentRuleIds",parentData:data,parentDataProperty:"judgmentRuleIds",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate28.errors : vErrors.concat(validate28.errors);
errors = vErrors.length;
}
var valid0 = _errs5 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.narrativeRuleIds !== undefined){
const _errs6 = errors;
if(!(validate30(data.narrativeRuleIds, {instancePath:instancePath+"/narrativeRuleIds",parentData:data,parentDataProperty:"narrativeRuleIds",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate30.errors : vErrors.concat(validate30.errors);
errors = vErrors.length;
}
var valid0 = _errs6 === errors;
}
else {
var valid0 = true;
}
}
}
}
}
}
}
}
else {
validate21.errors = [{instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"}];
return false;
}
}
validate21.errors = vErrors;
return errors === 0;
}
validate21.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

const schema45 = {"oneOf":[{"$ref":"#/$defs/timeRangeCondition"},{"$ref":"#/$defs/categoryCondition"},{"$ref":"#/$defs/numberRangeCondition"}]};
const schema46 = {"type":"object","additionalProperties":false,"required":["conditionId","kind","fieldId","start","end"],"properties":{"conditionId":{"$ref":"#/$defs/analysisConditionId"},"kind":{"const":"time-range"},"fieldId":{"$ref":"#/$defs/fieldId"},"start":{"type":"string","minLength":10,"maxLength":64,"pattern":"^\\d{4}-\\d{2}-\\d{2}(?:T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{1,9})?(?:Z|[+-]\\d{2}:\\d{2}))?$"},"end":{"type":"string","minLength":10,"maxLength":64,"pattern":"^\\d{4}-\\d{2}-\\d{2}(?:T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{1,9})?(?:Z|[+-]\\d{2}:\\d{2}))?$"}}};
const schema47 = {"type":"string","minLength":20,"maxLength":83,"pattern":"^analysis_condition_[a-z0-9]+(?:-[a-z0-9]+)*$"};
const pattern12 = new RegExp("^analysis_condition_[a-z0-9]+(?:-[a-z0-9]+)*$", "u");
const pattern14 = new RegExp("^\\d{4}-\\d{2}-\\d{2}(?:T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{1,9})?(?:Z|[+-]\\d{2}:\\d{2}))?$", "u");

function validate34(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate34.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(errors === 0){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing0;
if((((((data.conditionId === undefined) && (missing0 = "conditionId")) || ((data.kind === undefined) && (missing0 = "kind"))) || ((data.fieldId === undefined) && (missing0 = "fieldId"))) || ((data.start === undefined) && (missing0 = "start"))) || ((data.end === undefined) && (missing0 = "end"))){
validate34.errors = [{instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: missing0},message:"must have required property '"+missing0+"'"}];
return false;
}
else {
const _errs1 = errors;
for(const key0 in data){
if(!(((((key0 === "conditionId") || (key0 === "kind")) || (key0 === "fieldId")) || (key0 === "start")) || (key0 === "end"))){
validate34.errors = [{instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"}];
return false;
break;
}
}
if(_errs1 === errors){
if(data.conditionId !== undefined){
let data0 = data.conditionId;
const _errs2 = errors;
const _errs3 = errors;
if(errors === _errs3){
if(typeof data0 === "string"){
if(func2(data0) > 83){
validate34.errors = [{instancePath:instancePath+"/conditionId",schemaPath:"#/$defs/analysisConditionId/maxLength",keyword:"maxLength",params:{limit: 83},message:"must NOT have more than 83 characters"}];
return false;
}
else {
if(func2(data0) < 20){
validate34.errors = [{instancePath:instancePath+"/conditionId",schemaPath:"#/$defs/analysisConditionId/minLength",keyword:"minLength",params:{limit: 20},message:"must NOT have fewer than 20 characters"}];
return false;
}
else {
if(!pattern12.test(data0)){
validate34.errors = [{instancePath:instancePath+"/conditionId",schemaPath:"#/$defs/analysisConditionId/pattern",keyword:"pattern",params:{pattern: "^analysis_condition_[a-z0-9]+(?:-[a-z0-9]+)*$"},message:"must match pattern \""+"^analysis_condition_[a-z0-9]+(?:-[a-z0-9]+)*$"+"\""}];
return false;
}
}
}
}
else {
validate34.errors = [{instancePath:instancePath+"/conditionId",schemaPath:"#/$defs/analysisConditionId/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
}
var valid0 = _errs2 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.kind !== undefined){
const _errs5 = errors;
if("time-range" !== data.kind){
validate34.errors = [{instancePath:instancePath+"/kind",schemaPath:"#/properties/kind/const",keyword:"const",params:{allowedValue: "time-range"},message:"must be equal to constant"}];
return false;
}
var valid0 = _errs5 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.fieldId !== undefined){
let data2 = data.fieldId;
const _errs6 = errors;
const _errs7 = errors;
if(errors === _errs7){
if(typeof data2 === "string"){
if(func2(data2) > 70){
validate34.errors = [{instancePath:instancePath+"/fieldId",schemaPath:"#/$defs/fieldId/maxLength",keyword:"maxLength",params:{limit: 70},message:"must NOT have more than 70 characters"}];
return false;
}
else {
if(func2(data2) < 7){
validate34.errors = [{instancePath:instancePath+"/fieldId",schemaPath:"#/$defs/fieldId/minLength",keyword:"minLength",params:{limit: 7},message:"must NOT have fewer than 7 characters"}];
return false;
}
else {
if(!pattern7.test(data2)){
validate34.errors = [{instancePath:instancePath+"/fieldId",schemaPath:"#/$defs/fieldId/pattern",keyword:"pattern",params:{pattern: "^field_[a-z0-9]+(?:-[a-z0-9]+)*$"},message:"must match pattern \""+"^field_[a-z0-9]+(?:-[a-z0-9]+)*$"+"\""}];
return false;
}
}
}
}
else {
validate34.errors = [{instancePath:instancePath+"/fieldId",schemaPath:"#/$defs/fieldId/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
}
var valid0 = _errs6 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.start !== undefined){
let data3 = data.start;
const _errs9 = errors;
if(errors === _errs9){
if(typeof data3 === "string"){
if(func2(data3) > 64){
validate34.errors = [{instancePath:instancePath+"/start",schemaPath:"#/properties/start/maxLength",keyword:"maxLength",params:{limit: 64},message:"must NOT have more than 64 characters"}];
return false;
}
else {
if(func2(data3) < 10){
validate34.errors = [{instancePath:instancePath+"/start",schemaPath:"#/properties/start/minLength",keyword:"minLength",params:{limit: 10},message:"must NOT have fewer than 10 characters"}];
return false;
}
else {
if(!pattern14.test(data3)){
validate34.errors = [{instancePath:instancePath+"/start",schemaPath:"#/properties/start/pattern",keyword:"pattern",params:{pattern: "^\\d{4}-\\d{2}-\\d{2}(?:T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{1,9})?(?:Z|[+-]\\d{2}:\\d{2}))?$"},message:"must match pattern \""+"^\\d{4}-\\d{2}-\\d{2}(?:T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{1,9})?(?:Z|[+-]\\d{2}:\\d{2}))?$"+"\""}];
return false;
}
}
}
}
else {
validate34.errors = [{instancePath:instancePath+"/start",schemaPath:"#/properties/start/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
}
var valid0 = _errs9 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.end !== undefined){
let data4 = data.end;
const _errs11 = errors;
if(errors === _errs11){
if(typeof data4 === "string"){
if(func2(data4) > 64){
validate34.errors = [{instancePath:instancePath+"/end",schemaPath:"#/properties/end/maxLength",keyword:"maxLength",params:{limit: 64},message:"must NOT have more than 64 characters"}];
return false;
}
else {
if(func2(data4) < 10){
validate34.errors = [{instancePath:instancePath+"/end",schemaPath:"#/properties/end/minLength",keyword:"minLength",params:{limit: 10},message:"must NOT have fewer than 10 characters"}];
return false;
}
else {
if(!pattern14.test(data4)){
validate34.errors = [{instancePath:instancePath+"/end",schemaPath:"#/properties/end/pattern",keyword:"pattern",params:{pattern: "^\\d{4}-\\d{2}-\\d{2}(?:T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{1,9})?(?:Z|[+-]\\d{2}:\\d{2}))?$"},message:"must match pattern \""+"^\\d{4}-\\d{2}-\\d{2}(?:T\\d{2}:\\d{2}:\\d{2}(?:\\.\\d{1,9})?(?:Z|[+-]\\d{2}:\\d{2}))?$"+"\""}];
return false;
}
}
}
}
else {
validate34.errors = [{instancePath:instancePath+"/end",schemaPath:"#/properties/end/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
}
var valid0 = _errs11 === errors;
}
else {
var valid0 = true;
}
}
}
}
}
}
}
}
else {
validate34.errors = [{instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"}];
return false;
}
}
validate34.errors = vErrors;
return errors === 0;
}
validate34.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

const schema49 = {"type":"object","additionalProperties":false,"required":["conditionId","kind","fieldId","values","includeMissing"],"properties":{"conditionId":{"$ref":"#/$defs/analysisConditionId"},"kind":{"const":"category-in"},"fieldId":{"$ref":"#/$defs/fieldId"},"values":{"type":"array","minItems":1,"maxItems":64,"uniqueItems":true,"items":{"$ref":"#/$defs/categoryConditionValue"}},"includeMissing":{"type":"boolean"}}};
const schema52 = {"oneOf":[{"type":"string","minLength":1,"maxLength":256},{"type":"number"},{"type":"boolean"}]};

function validate36(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate36.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(errors === 0){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing0;
if((((((data.conditionId === undefined) && (missing0 = "conditionId")) || ((data.kind === undefined) && (missing0 = "kind"))) || ((data.fieldId === undefined) && (missing0 = "fieldId"))) || ((data.values === undefined) && (missing0 = "values"))) || ((data.includeMissing === undefined) && (missing0 = "includeMissing"))){
validate36.errors = [{instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: missing0},message:"must have required property '"+missing0+"'"}];
return false;
}
else {
const _errs1 = errors;
for(const key0 in data){
if(!(((((key0 === "conditionId") || (key0 === "kind")) || (key0 === "fieldId")) || (key0 === "values")) || (key0 === "includeMissing"))){
validate36.errors = [{instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"}];
return false;
break;
}
}
if(_errs1 === errors){
if(data.conditionId !== undefined){
let data0 = data.conditionId;
const _errs2 = errors;
const _errs3 = errors;
if(errors === _errs3){
if(typeof data0 === "string"){
if(func2(data0) > 83){
validate36.errors = [{instancePath:instancePath+"/conditionId",schemaPath:"#/$defs/analysisConditionId/maxLength",keyword:"maxLength",params:{limit: 83},message:"must NOT have more than 83 characters"}];
return false;
}
else {
if(func2(data0) < 20){
validate36.errors = [{instancePath:instancePath+"/conditionId",schemaPath:"#/$defs/analysisConditionId/minLength",keyword:"minLength",params:{limit: 20},message:"must NOT have fewer than 20 characters"}];
return false;
}
else {
if(!pattern12.test(data0)){
validate36.errors = [{instancePath:instancePath+"/conditionId",schemaPath:"#/$defs/analysisConditionId/pattern",keyword:"pattern",params:{pattern: "^analysis_condition_[a-z0-9]+(?:-[a-z0-9]+)*$"},message:"must match pattern \""+"^analysis_condition_[a-z0-9]+(?:-[a-z0-9]+)*$"+"\""}];
return false;
}
}
}
}
else {
validate36.errors = [{instancePath:instancePath+"/conditionId",schemaPath:"#/$defs/analysisConditionId/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
}
var valid0 = _errs2 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.kind !== undefined){
const _errs5 = errors;
if("category-in" !== data.kind){
validate36.errors = [{instancePath:instancePath+"/kind",schemaPath:"#/properties/kind/const",keyword:"const",params:{allowedValue: "category-in"},message:"must be equal to constant"}];
return false;
}
var valid0 = _errs5 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.fieldId !== undefined){
let data2 = data.fieldId;
const _errs6 = errors;
const _errs7 = errors;
if(errors === _errs7){
if(typeof data2 === "string"){
if(func2(data2) > 70){
validate36.errors = [{instancePath:instancePath+"/fieldId",schemaPath:"#/$defs/fieldId/maxLength",keyword:"maxLength",params:{limit: 70},message:"must NOT have more than 70 characters"}];
return false;
}
else {
if(func2(data2) < 7){
validate36.errors = [{instancePath:instancePath+"/fieldId",schemaPath:"#/$defs/fieldId/minLength",keyword:"minLength",params:{limit: 7},message:"must NOT have fewer than 7 characters"}];
return false;
}
else {
if(!pattern7.test(data2)){
validate36.errors = [{instancePath:instancePath+"/fieldId",schemaPath:"#/$defs/fieldId/pattern",keyword:"pattern",params:{pattern: "^field_[a-z0-9]+(?:-[a-z0-9]+)*$"},message:"must match pattern \""+"^field_[a-z0-9]+(?:-[a-z0-9]+)*$"+"\""}];
return false;
}
}
}
}
else {
validate36.errors = [{instancePath:instancePath+"/fieldId",schemaPath:"#/$defs/fieldId/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
}
var valid0 = _errs6 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.values !== undefined){
let data3 = data.values;
const _errs9 = errors;
if(errors === _errs9){
if(Array.isArray(data3)){
if(data3.length > 64){
validate36.errors = [{instancePath:instancePath+"/values",schemaPath:"#/properties/values/maxItems",keyword:"maxItems",params:{limit: 64},message:"must NOT have more than 64 items"}];
return false;
}
else {
if(data3.length < 1){
validate36.errors = [{instancePath:instancePath+"/values",schemaPath:"#/properties/values/minItems",keyword:"minItems",params:{limit: 1},message:"must NOT have fewer than 1 items"}];
return false;
}
else {
var valid3 = true;
const len0 = data3.length;
for(let i0=0; i0<len0; i0++){
let data4 = data3[i0];
const _errs11 = errors;
const _errs13 = errors;
let valid5 = false;
let passing0 = null;
const _errs14 = errors;
if(errors === _errs14){
if(typeof data4 === "string"){
if(func2(data4) > 256){
const err0 = {instancePath:instancePath+"/values/" + i0,schemaPath:"#/$defs/categoryConditionValue/oneOf/0/maxLength",keyword:"maxLength",params:{limit: 256},message:"must NOT have more than 256 characters"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
else {
if(func2(data4) < 1){
const err1 = {instancePath:instancePath+"/values/" + i0,schemaPath:"#/$defs/categoryConditionValue/oneOf/0/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
}
}
else {
const err2 = {instancePath:instancePath+"/values/" + i0,schemaPath:"#/$defs/categoryConditionValue/oneOf/0/type",keyword:"type",params:{type: "string"},message:"must be string"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
}
var _valid0 = _errs14 === errors;
if(_valid0){
valid5 = true;
passing0 = 0;
}
const _errs16 = errors;
if(!((typeof data4 == "number") && (isFinite(data4)))){
const err3 = {instancePath:instancePath+"/values/" + i0,schemaPath:"#/$defs/categoryConditionValue/oneOf/1/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
var _valid0 = _errs16 === errors;
if(_valid0 && valid5){
valid5 = false;
passing0 = [passing0, 1];
}
else {
if(_valid0){
valid5 = true;
passing0 = 1;
}
const _errs18 = errors;
if(typeof data4 !== "boolean"){
const err4 = {instancePath:instancePath+"/values/" + i0,schemaPath:"#/$defs/categoryConditionValue/oneOf/2/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
}
var _valid0 = _errs18 === errors;
if(_valid0 && valid5){
valid5 = false;
passing0 = [passing0, 2];
}
else {
if(_valid0){
valid5 = true;
passing0 = 2;
}
}
}
if(!valid5){
const err5 = {instancePath:instancePath+"/values/" + i0,schemaPath:"#/$defs/categoryConditionValue/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err5];
}
else {
vErrors.push(err5);
}
errors++;
validate36.errors = vErrors;
return false;
}
else {
errors = _errs13;
if(vErrors !== null){
if(_errs13){
vErrors.length = _errs13;
}
else {
vErrors = null;
}
}
}
var valid3 = _errs11 === errors;
if(!valid3){
break;
}
}
if(valid3){
let i1 = data3.length;
let j0;
if(i1 > 1){
outer0:
for(;i1--;){
for(j0 = i1; j0--;){
if(func0(data3[i1], data3[j0])){
validate36.errors = [{instancePath:instancePath+"/values",schemaPath:"#/properties/values/uniqueItems",keyword:"uniqueItems",params:{i: i1, j: j0},message:"must NOT have duplicate items (items ## "+j0+" and "+i1+" are identical)"}];
return false;
break outer0;
}
}
}
}
}
}
}
}
else {
validate36.errors = [{instancePath:instancePath+"/values",schemaPath:"#/properties/values/type",keyword:"type",params:{type: "array"},message:"must be array"}];
return false;
}
}
var valid0 = _errs9 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.includeMissing !== undefined){
const _errs20 = errors;
if(typeof data.includeMissing !== "boolean"){
validate36.errors = [{instancePath:instancePath+"/includeMissing",schemaPath:"#/properties/includeMissing/type",keyword:"type",params:{type: "boolean"},message:"must be boolean"}];
return false;
}
var valid0 = _errs20 === errors;
}
else {
var valid0 = true;
}
}
}
}
}
}
}
}
else {
validate36.errors = [{instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"}];
return false;
}
}
validate36.errors = vErrors;
return errors === 0;
}
validate36.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

const schema53 = {"type":"object","additionalProperties":false,"required":["conditionId","kind","fieldId"],"properties":{"conditionId":{"$ref":"#/$defs/analysisConditionId"},"kind":{"const":"number-range"},"fieldId":{"$ref":"#/$defs/fieldId"},"minimum":{"type":"number"},"maximum":{"type":"number"}},"anyOf":[{"required":["minimum"],"properties":{"minimum":{"type":"number"}}},{"required":["maximum"],"properties":{"maximum":{"type":"number"}}}]};

function validate38(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate38.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
const _errs1 = errors;
let valid0 = false;
const _errs2 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
let missing0;
if((data.minimum === undefined) && (missing0 = "minimum")){
const err0 = {instancePath,schemaPath:"#/anyOf/0/required",keyword:"required",params:{missingProperty: missing0},message:"must have required property '"+missing0+"'"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
}
else {
if(data.minimum !== undefined){
let data0 = data.minimum;
if(!((typeof data0 == "number") && (isFinite(data0)))){
const err1 = {instancePath:instancePath+"/minimum",schemaPath:"#/anyOf/0/properties/minimum/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err1];
}
else {
vErrors.push(err1);
}
errors++;
}
}
}
}
var _valid0 = _errs2 === errors;
valid0 = valid0 || _valid0;
if(_valid0){
var props0 = {};
props0.minimum = true;
}
const _errs5 = errors;
if(data && typeof data == "object" && !Array.isArray(data)){
let missing1;
if((data.maximum === undefined) && (missing1 = "maximum")){
const err2 = {instancePath,schemaPath:"#/anyOf/1/required",keyword:"required",params:{missingProperty: missing1},message:"must have required property '"+missing1+"'"};
if(vErrors === null){
vErrors = [err2];
}
else {
vErrors.push(err2);
}
errors++;
}
else {
if(data.maximum !== undefined){
let data1 = data.maximum;
if(!((typeof data1 == "number") && (isFinite(data1)))){
const err3 = {instancePath:instancePath+"/maximum",schemaPath:"#/anyOf/1/properties/maximum/type",keyword:"type",params:{type: "number"},message:"must be number"};
if(vErrors === null){
vErrors = [err3];
}
else {
vErrors.push(err3);
}
errors++;
}
}
}
}
var _valid0 = _errs5 === errors;
valid0 = valid0 || _valid0;
if(_valid0){
if(props0 !== true){
props0 = props0 || {};
props0.maximum = true;
}
}
if(!valid0){
const err4 = {instancePath,schemaPath:"#/anyOf",keyword:"anyOf",params:{},message:"must match a schema in anyOf"};
if(vErrors === null){
vErrors = [err4];
}
else {
vErrors.push(err4);
}
errors++;
validate38.errors = vErrors;
return false;
}
else {
errors = _errs1;
if(vErrors !== null){
if(_errs1){
vErrors.length = _errs1;
}
else {
vErrors = null;
}
}
}
if(errors === 0){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing2;
if((((data.conditionId === undefined) && (missing2 = "conditionId")) || ((data.kind === undefined) && (missing2 = "kind"))) || ((data.fieldId === undefined) && (missing2 = "fieldId"))){
validate38.errors = [{instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: missing2},message:"must have required property '"+missing2+"'"}];
return false;
}
else {
const _errs8 = errors;
for(const key0 in data){
if(!(((((key0 === "conditionId") || (key0 === "kind")) || (key0 === "fieldId")) || (key0 === "minimum")) || (key0 === "maximum"))){
validate38.errors = [{instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"}];
return false;
break;
}
}
if(_errs8 === errors){
if(data.conditionId !== undefined){
let data2 = data.conditionId;
const _errs9 = errors;
const _errs10 = errors;
if(errors === _errs10){
if(typeof data2 === "string"){
if(func2(data2) > 83){
validate38.errors = [{instancePath:instancePath+"/conditionId",schemaPath:"#/$defs/analysisConditionId/maxLength",keyword:"maxLength",params:{limit: 83},message:"must NOT have more than 83 characters"}];
return false;
}
else {
if(func2(data2) < 20){
validate38.errors = [{instancePath:instancePath+"/conditionId",schemaPath:"#/$defs/analysisConditionId/minLength",keyword:"minLength",params:{limit: 20},message:"must NOT have fewer than 20 characters"}];
return false;
}
else {
if(!pattern12.test(data2)){
validate38.errors = [{instancePath:instancePath+"/conditionId",schemaPath:"#/$defs/analysisConditionId/pattern",keyword:"pattern",params:{pattern: "^analysis_condition_[a-z0-9]+(?:-[a-z0-9]+)*$"},message:"must match pattern \""+"^analysis_condition_[a-z0-9]+(?:-[a-z0-9]+)*$"+"\""}];
return false;
}
}
}
}
else {
validate38.errors = [{instancePath:instancePath+"/conditionId",schemaPath:"#/$defs/analysisConditionId/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
}
var valid3 = _errs9 === errors;
}
else {
var valid3 = true;
}
if(valid3){
if(data.kind !== undefined){
const _errs12 = errors;
if("number-range" !== data.kind){
validate38.errors = [{instancePath:instancePath+"/kind",schemaPath:"#/properties/kind/const",keyword:"const",params:{allowedValue: "number-range"},message:"must be equal to constant"}];
return false;
}
var valid3 = _errs12 === errors;
}
else {
var valid3 = true;
}
if(valid3){
if(data.fieldId !== undefined){
let data4 = data.fieldId;
const _errs13 = errors;
const _errs14 = errors;
if(errors === _errs14){
if(typeof data4 === "string"){
if(func2(data4) > 70){
validate38.errors = [{instancePath:instancePath+"/fieldId",schemaPath:"#/$defs/fieldId/maxLength",keyword:"maxLength",params:{limit: 70},message:"must NOT have more than 70 characters"}];
return false;
}
else {
if(func2(data4) < 7){
validate38.errors = [{instancePath:instancePath+"/fieldId",schemaPath:"#/$defs/fieldId/minLength",keyword:"minLength",params:{limit: 7},message:"must NOT have fewer than 7 characters"}];
return false;
}
else {
if(!pattern7.test(data4)){
validate38.errors = [{instancePath:instancePath+"/fieldId",schemaPath:"#/$defs/fieldId/pattern",keyword:"pattern",params:{pattern: "^field_[a-z0-9]+(?:-[a-z0-9]+)*$"},message:"must match pattern \""+"^field_[a-z0-9]+(?:-[a-z0-9]+)*$"+"\""}];
return false;
}
}
}
}
else {
validate38.errors = [{instancePath:instancePath+"/fieldId",schemaPath:"#/$defs/fieldId/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
}
var valid3 = _errs13 === errors;
}
else {
var valid3 = true;
}
if(valid3){
if(data.minimum !== undefined){
let data5 = data.minimum;
const _errs16 = errors;
if(!((typeof data5 == "number") && (isFinite(data5)))){
validate38.errors = [{instancePath:instancePath+"/minimum",schemaPath:"#/properties/minimum/type",keyword:"type",params:{type: "number"},message:"must be number"}];
return false;
}
var valid3 = _errs16 === errors;
}
else {
var valid3 = true;
}
if(valid3){
if(data.maximum !== undefined){
let data6 = data.maximum;
const _errs18 = errors;
if(!((typeof data6 == "number") && (isFinite(data6)))){
validate38.errors = [{instancePath:instancePath+"/maximum",schemaPath:"#/properties/maximum/type",keyword:"type",params:{type: "number"},message:"must be number"}];
return false;
}
var valid3 = _errs18 === errors;
}
else {
var valid3 = true;
}
}
}
}
}
}
}
}
else {
validate38.errors = [{instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"}];
return false;
}
}
validate38.errors = vErrors;
return errors === 0;
}
validate38.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};


function validate33(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate33.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
const _errs0 = errors;
let valid0 = false;
let passing0 = null;
const _errs1 = errors;
if(!(validate34(data, {instancePath,parentData,parentDataProperty,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate34.errors : vErrors.concat(validate34.errors);
errors = vErrors.length;
}
var _valid0 = _errs1 === errors;
if(_valid0){
valid0 = true;
passing0 = 0;
var props0 = true;
}
const _errs2 = errors;
if(!(validate36(data, {instancePath,parentData,parentDataProperty,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate36.errors : vErrors.concat(validate36.errors);
errors = vErrors.length;
}
var _valid0 = _errs2 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 1];
}
else {
if(_valid0){
valid0 = true;
passing0 = 1;
if(props0 !== true){
props0 = true;
}
}
const _errs3 = errors;
if(!(validate38(data, {instancePath,parentData,parentDataProperty,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate38.errors : vErrors.concat(validate38.errors);
errors = vErrors.length;
}
var _valid0 = _errs3 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 2];
}
else {
if(_valid0){
valid0 = true;
passing0 = 2;
if(props0 !== true){
props0 = true;
}
}
}
}
if(!valid0){
const err0 = {instancePath,schemaPath:"#/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
validate33.errors = vErrors;
return false;
}
else {
errors = _errs0;
if(vErrors !== null){
if(_errs0){
vErrors.length = _errs0;
}
else {
vErrors = null;
}
}
}
validate33.errors = vErrors;
evaluated0.props = props0;
return errors === 0;
}
validate33.evaluated = {"dynamicProps":true,"dynamicItems":false};

const schema56 = {"type":"array","maxItems":64,"uniqueItems":true,"items":{"$ref":"#/$defs/analysisConditionId"}};

function validate41(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate41.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(errors === 0){
if(Array.isArray(data)){
if(data.length > 64){
validate41.errors = [{instancePath,schemaPath:"#/maxItems",keyword:"maxItems",params:{limit: 64},message:"must NOT have more than 64 items"}];
return false;
}
else {
var valid0 = true;
const len0 = data.length;
for(let i0=0; i0<len0; i0++){
let data0 = data[i0];
const _errs1 = errors;
const _errs2 = errors;
if(errors === _errs2){
if(typeof data0 === "string"){
if(func2(data0) > 83){
validate41.errors = [{instancePath:instancePath+"/" + i0,schemaPath:"#/$defs/analysisConditionId/maxLength",keyword:"maxLength",params:{limit: 83},message:"must NOT have more than 83 characters"}];
return false;
}
else {
if(func2(data0) < 20){
validate41.errors = [{instancePath:instancePath+"/" + i0,schemaPath:"#/$defs/analysisConditionId/minLength",keyword:"minLength",params:{limit: 20},message:"must NOT have fewer than 20 characters"}];
return false;
}
else {
if(!pattern12.test(data0)){
validate41.errors = [{instancePath:instancePath+"/" + i0,schemaPath:"#/$defs/analysisConditionId/pattern",keyword:"pattern",params:{pattern: "^analysis_condition_[a-z0-9]+(?:-[a-z0-9]+)*$"},message:"must match pattern \""+"^analysis_condition_[a-z0-9]+(?:-[a-z0-9]+)*$"+"\""}];
return false;
}
}
}
}
else {
validate41.errors = [{instancePath:instancePath+"/" + i0,schemaPath:"#/$defs/analysisConditionId/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
}
var valid0 = _errs1 === errors;
if(!valid0){
break;
}
}
if(valid0){
let i1 = data.length;
let j0;
if(i1 > 1){
outer0:
for(;i1--;){
for(j0 = i1; j0--;){
if(func0(data[i1], data[j0])){
validate41.errors = [{instancePath,schemaPath:"#/uniqueItems",keyword:"uniqueItems",params:{i: i1, j: j0},message:"must NOT have duplicate items (items ## "+j0+" and "+i1+" are identical)"}];
return false;
break outer0;
}
}
}
}
}
}
}
else {
validate41.errors = [{instancePath,schemaPath:"#/type",keyword:"type",params:{type: "array"},message:"must be array"}];
return false;
}
}
validate41.errors = vErrors;
return errors === 0;
}
validate41.evaluated = {"items":true,"dynamicProps":false,"dynamicItems":false};

const schema60 = {"oneOf":[{"$ref":"#/$defs/titleSummaryBlock"},{"$ref":"#/$defs/kpiBlock"}]};
const schema61 = {"type":"object","additionalProperties":false,"required":["blockId","blockType","layout","additionalConditionIds","evidenceIds","judgmentRuleIds","narrativeRuleIds","content","visualVariant"],"properties":{"blockId":{"$ref":"#/$defs/storyBlockId"},"blockType":{"const":"title-summary"},"layout":{"$ref":"#/$defs/blockLayout"},"additionalConditionIds":{"$ref":"#/$defs/analysisConditionIdList"},"evidenceIds":{"$ref":"#/$defs/evidenceIdList"},"judgmentRuleIds":{"$ref":"#/$defs/judgmentRuleIdList"},"narrativeRuleIds":{"$ref":"#/$defs/narrativeRuleIdList"},"content":{"type":"object","additionalProperties":false,"required":["title","summary"],"properties":{"title":{"type":"string","minLength":1,"maxLength":160},"summary":{"type":"string","minLength":1,"maxLength":4000}}},"visualVariant":{"enum":["hero","plain"]}}};
const schema62 = {"type":"string","minLength":13,"maxLength":76,"pattern":"^story_block_[a-z0-9]+(?:-[a-z0-9]+)*$"};
const schema63 = {"type":"object","additionalProperties":false,"required":["variant"],"properties":{"variant":{"enum":["full-width","split-left","split-right","emphasis"]}}};
const pattern21 = new RegExp("^story_block_[a-z0-9]+(?:-[a-z0-9]+)*$", "u");

function validate44(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate44.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(errors === 0){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing0;
if((((((((((data.blockId === undefined) && (missing0 = "blockId")) || ((data.blockType === undefined) && (missing0 = "blockType"))) || ((data.layout === undefined) && (missing0 = "layout"))) || ((data.additionalConditionIds === undefined) && (missing0 = "additionalConditionIds"))) || ((data.evidenceIds === undefined) && (missing0 = "evidenceIds"))) || ((data.judgmentRuleIds === undefined) && (missing0 = "judgmentRuleIds"))) || ((data.narrativeRuleIds === undefined) && (missing0 = "narrativeRuleIds"))) || ((data.content === undefined) && (missing0 = "content"))) || ((data.visualVariant === undefined) && (missing0 = "visualVariant"))){
validate44.errors = [{instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: missing0},message:"must have required property '"+missing0+"'"}];
return false;
}
else {
const _errs1 = errors;
for(const key0 in data){
if(!(func1.call(schema61.properties, key0))){
validate44.errors = [{instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"}];
return false;
break;
}
}
if(_errs1 === errors){
if(data.blockId !== undefined){
let data0 = data.blockId;
const _errs2 = errors;
const _errs3 = errors;
if(errors === _errs3){
if(typeof data0 === "string"){
if(func2(data0) > 76){
validate44.errors = [{instancePath:instancePath+"/blockId",schemaPath:"#/$defs/storyBlockId/maxLength",keyword:"maxLength",params:{limit: 76},message:"must NOT have more than 76 characters"}];
return false;
}
else {
if(func2(data0) < 13){
validate44.errors = [{instancePath:instancePath+"/blockId",schemaPath:"#/$defs/storyBlockId/minLength",keyword:"minLength",params:{limit: 13},message:"must NOT have fewer than 13 characters"}];
return false;
}
else {
if(!pattern21.test(data0)){
validate44.errors = [{instancePath:instancePath+"/blockId",schemaPath:"#/$defs/storyBlockId/pattern",keyword:"pattern",params:{pattern: "^story_block_[a-z0-9]+(?:-[a-z0-9]+)*$"},message:"must match pattern \""+"^story_block_[a-z0-9]+(?:-[a-z0-9]+)*$"+"\""}];
return false;
}
}
}
}
else {
validate44.errors = [{instancePath:instancePath+"/blockId",schemaPath:"#/$defs/storyBlockId/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
}
var valid0 = _errs2 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.blockType !== undefined){
const _errs5 = errors;
if("title-summary" !== data.blockType){
validate44.errors = [{instancePath:instancePath+"/blockType",schemaPath:"#/properties/blockType/const",keyword:"const",params:{allowedValue: "title-summary"},message:"must be equal to constant"}];
return false;
}
var valid0 = _errs5 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.layout !== undefined){
let data2 = data.layout;
const _errs6 = errors;
const _errs7 = errors;
if(errors === _errs7){
if(data2 && typeof data2 == "object" && !Array.isArray(data2)){
let missing1;
if((data2.variant === undefined) && (missing1 = "variant")){
validate44.errors = [{instancePath:instancePath+"/layout",schemaPath:"#/$defs/blockLayout/required",keyword:"required",params:{missingProperty: missing1},message:"must have required property '"+missing1+"'"}];
return false;
}
else {
const _errs9 = errors;
for(const key1 in data2){
if(!(key1 === "variant")){
validate44.errors = [{instancePath:instancePath+"/layout",schemaPath:"#/$defs/blockLayout/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"}];
return false;
break;
}
}
if(_errs9 === errors){
if(data2.variant !== undefined){
let data3 = data2.variant;
if(!((((data3 === "full-width") || (data3 === "split-left")) || (data3 === "split-right")) || (data3 === "emphasis"))){
validate44.errors = [{instancePath:instancePath+"/layout/variant",schemaPath:"#/$defs/blockLayout/properties/variant/enum",keyword:"enum",params:{allowedValues: schema63.properties.variant.enum},message:"must be equal to one of the allowed values"}];
return false;
}
}
}
}
}
else {
validate44.errors = [{instancePath:instancePath+"/layout",schemaPath:"#/$defs/blockLayout/type",keyword:"type",params:{type: "object"},message:"must be object"}];
return false;
}
}
var valid0 = _errs6 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.additionalConditionIds !== undefined){
const _errs11 = errors;
if(!(validate41(data.additionalConditionIds, {instancePath:instancePath+"/additionalConditionIds",parentData:data,parentDataProperty:"additionalConditionIds",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate41.errors : vErrors.concat(validate41.errors);
errors = vErrors.length;
}
var valid0 = _errs11 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.evidenceIds !== undefined){
const _errs12 = errors;
if(!(validate26(data.evidenceIds, {instancePath:instancePath+"/evidenceIds",parentData:data,parentDataProperty:"evidenceIds",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate26.errors : vErrors.concat(validate26.errors);
errors = vErrors.length;
}
var valid0 = _errs12 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.judgmentRuleIds !== undefined){
const _errs13 = errors;
if(!(validate28(data.judgmentRuleIds, {instancePath:instancePath+"/judgmentRuleIds",parentData:data,parentDataProperty:"judgmentRuleIds",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate28.errors : vErrors.concat(validate28.errors);
errors = vErrors.length;
}
var valid0 = _errs13 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.narrativeRuleIds !== undefined){
const _errs14 = errors;
if(!(validate30(data.narrativeRuleIds, {instancePath:instancePath+"/narrativeRuleIds",parentData:data,parentDataProperty:"narrativeRuleIds",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate30.errors : vErrors.concat(validate30.errors);
errors = vErrors.length;
}
var valid0 = _errs14 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.content !== undefined){
let data8 = data.content;
const _errs15 = errors;
if(errors === _errs15){
if(data8 && typeof data8 == "object" && !Array.isArray(data8)){
let missing2;
if(((data8.title === undefined) && (missing2 = "title")) || ((data8.summary === undefined) && (missing2 = "summary"))){
validate44.errors = [{instancePath:instancePath+"/content",schemaPath:"#/properties/content/required",keyword:"required",params:{missingProperty: missing2},message:"must have required property '"+missing2+"'"}];
return false;
}
else {
const _errs17 = errors;
for(const key2 in data8){
if(!((key2 === "title") || (key2 === "summary"))){
validate44.errors = [{instancePath:instancePath+"/content",schemaPath:"#/properties/content/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key2},message:"must NOT have additional properties"}];
return false;
break;
}
}
if(_errs17 === errors){
if(data8.title !== undefined){
let data9 = data8.title;
const _errs18 = errors;
if(errors === _errs18){
if(typeof data9 === "string"){
if(func2(data9) > 160){
validate44.errors = [{instancePath:instancePath+"/content/title",schemaPath:"#/properties/content/properties/title/maxLength",keyword:"maxLength",params:{limit: 160},message:"must NOT have more than 160 characters"}];
return false;
}
else {
if(func2(data9) < 1){
validate44.errors = [{instancePath:instancePath+"/content/title",schemaPath:"#/properties/content/properties/title/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"}];
return false;
}
}
}
else {
validate44.errors = [{instancePath:instancePath+"/content/title",schemaPath:"#/properties/content/properties/title/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
}
var valid4 = _errs18 === errors;
}
else {
var valid4 = true;
}
if(valid4){
if(data8.summary !== undefined){
let data10 = data8.summary;
const _errs20 = errors;
if(errors === _errs20){
if(typeof data10 === "string"){
if(func2(data10) > 4000){
validate44.errors = [{instancePath:instancePath+"/content/summary",schemaPath:"#/properties/content/properties/summary/maxLength",keyword:"maxLength",params:{limit: 4000},message:"must NOT have more than 4000 characters"}];
return false;
}
else {
if(func2(data10) < 1){
validate44.errors = [{instancePath:instancePath+"/content/summary",schemaPath:"#/properties/content/properties/summary/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"}];
return false;
}
}
}
else {
validate44.errors = [{instancePath:instancePath+"/content/summary",schemaPath:"#/properties/content/properties/summary/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
}
var valid4 = _errs20 === errors;
}
else {
var valid4 = true;
}
}
}
}
}
else {
validate44.errors = [{instancePath:instancePath+"/content",schemaPath:"#/properties/content/type",keyword:"type",params:{type: "object"},message:"must be object"}];
return false;
}
}
var valid0 = _errs15 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.visualVariant !== undefined){
let data11 = data.visualVariant;
const _errs22 = errors;
if(!((data11 === "hero") || (data11 === "plain"))){
validate44.errors = [{instancePath:instancePath+"/visualVariant",schemaPath:"#/properties/visualVariant/enum",keyword:"enum",params:{allowedValues: schema61.properties.visualVariant.enum},message:"must be equal to one of the allowed values"}];
return false;
}
var valid0 = _errs22 === errors;
}
else {
var valid0 = true;
}
}
}
}
}
}
}
}
}
}
}
}
else {
validate44.errors = [{instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"}];
return false;
}
}
validate44.errors = vErrors;
return errors === 0;
}
validate44.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};

const schema64 = {"type":"object","additionalProperties":false,"required":["blockId","blockType","layout","additionalConditionIds","metricId","evidenceIds","judgmentRuleIds","narrativeRuleIds","label","visualVariant"],"properties":{"blockId":{"$ref":"#/$defs/storyBlockId"},"blockType":{"const":"kpi"},"layout":{"$ref":"#/$defs/blockLayout"},"additionalConditionIds":{"$ref":"#/$defs/analysisConditionIdList"},"metricId":{"$ref":"#/$defs/metricId"},"evidenceIds":{"type":"array","minItems":1,"maxItems":256,"uniqueItems":true,"items":{"$ref":"#/$defs/evidenceId"}},"judgmentRuleIds":{"$ref":"#/$defs/judgmentRuleIdList"},"narrativeRuleIds":{"$ref":"#/$defs/narrativeRuleIdList"},"label":{"type":"string","minLength":1,"maxLength":160},"visualVariant":{"enum":["metric-card","metric-feature"]}}};

function validate50(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate50.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(errors === 0){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing0;
if(((((((((((data.blockId === undefined) && (missing0 = "blockId")) || ((data.blockType === undefined) && (missing0 = "blockType"))) || ((data.layout === undefined) && (missing0 = "layout"))) || ((data.additionalConditionIds === undefined) && (missing0 = "additionalConditionIds"))) || ((data.metricId === undefined) && (missing0 = "metricId"))) || ((data.evidenceIds === undefined) && (missing0 = "evidenceIds"))) || ((data.judgmentRuleIds === undefined) && (missing0 = "judgmentRuleIds"))) || ((data.narrativeRuleIds === undefined) && (missing0 = "narrativeRuleIds"))) || ((data.label === undefined) && (missing0 = "label"))) || ((data.visualVariant === undefined) && (missing0 = "visualVariant"))){
validate50.errors = [{instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: missing0},message:"must have required property '"+missing0+"'"}];
return false;
}
else {
const _errs1 = errors;
for(const key0 in data){
if(!(func1.call(schema64.properties, key0))){
validate50.errors = [{instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"}];
return false;
break;
}
}
if(_errs1 === errors){
if(data.blockId !== undefined){
let data0 = data.blockId;
const _errs2 = errors;
const _errs3 = errors;
if(errors === _errs3){
if(typeof data0 === "string"){
if(func2(data0) > 76){
validate50.errors = [{instancePath:instancePath+"/blockId",schemaPath:"#/$defs/storyBlockId/maxLength",keyword:"maxLength",params:{limit: 76},message:"must NOT have more than 76 characters"}];
return false;
}
else {
if(func2(data0) < 13){
validate50.errors = [{instancePath:instancePath+"/blockId",schemaPath:"#/$defs/storyBlockId/minLength",keyword:"minLength",params:{limit: 13},message:"must NOT have fewer than 13 characters"}];
return false;
}
else {
if(!pattern21.test(data0)){
validate50.errors = [{instancePath:instancePath+"/blockId",schemaPath:"#/$defs/storyBlockId/pattern",keyword:"pattern",params:{pattern: "^story_block_[a-z0-9]+(?:-[a-z0-9]+)*$"},message:"must match pattern \""+"^story_block_[a-z0-9]+(?:-[a-z0-9]+)*$"+"\""}];
return false;
}
}
}
}
else {
validate50.errors = [{instancePath:instancePath+"/blockId",schemaPath:"#/$defs/storyBlockId/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
}
var valid0 = _errs2 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.blockType !== undefined){
const _errs5 = errors;
if("kpi" !== data.blockType){
validate50.errors = [{instancePath:instancePath+"/blockType",schemaPath:"#/properties/blockType/const",keyword:"const",params:{allowedValue: "kpi"},message:"must be equal to constant"}];
return false;
}
var valid0 = _errs5 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.layout !== undefined){
let data2 = data.layout;
const _errs6 = errors;
const _errs7 = errors;
if(errors === _errs7){
if(data2 && typeof data2 == "object" && !Array.isArray(data2)){
let missing1;
if((data2.variant === undefined) && (missing1 = "variant")){
validate50.errors = [{instancePath:instancePath+"/layout",schemaPath:"#/$defs/blockLayout/required",keyword:"required",params:{missingProperty: missing1},message:"must have required property '"+missing1+"'"}];
return false;
}
else {
const _errs9 = errors;
for(const key1 in data2){
if(!(key1 === "variant")){
validate50.errors = [{instancePath:instancePath+"/layout",schemaPath:"#/$defs/blockLayout/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"}];
return false;
break;
}
}
if(_errs9 === errors){
if(data2.variant !== undefined){
let data3 = data2.variant;
if(!((((data3 === "full-width") || (data3 === "split-left")) || (data3 === "split-right")) || (data3 === "emphasis"))){
validate50.errors = [{instancePath:instancePath+"/layout/variant",schemaPath:"#/$defs/blockLayout/properties/variant/enum",keyword:"enum",params:{allowedValues: schema63.properties.variant.enum},message:"must be equal to one of the allowed values"}];
return false;
}
}
}
}
}
else {
validate50.errors = [{instancePath:instancePath+"/layout",schemaPath:"#/$defs/blockLayout/type",keyword:"type",params:{type: "object"},message:"must be object"}];
return false;
}
}
var valid0 = _errs6 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.additionalConditionIds !== undefined){
const _errs11 = errors;
if(!(validate41(data.additionalConditionIds, {instancePath:instancePath+"/additionalConditionIds",parentData:data,parentDataProperty:"additionalConditionIds",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate41.errors : vErrors.concat(validate41.errors);
errors = vErrors.length;
}
var valid0 = _errs11 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.metricId !== undefined){
let data5 = data.metricId;
const _errs12 = errors;
const _errs13 = errors;
if(errors === _errs13){
if(typeof data5 === "string"){
if(func2(data5) > 71){
validate50.errors = [{instancePath:instancePath+"/metricId",schemaPath:"#/$defs/metricId/maxLength",keyword:"maxLength",params:{limit: 71},message:"must NOT have more than 71 characters"}];
return false;
}
else {
if(func2(data5) < 8){
validate50.errors = [{instancePath:instancePath+"/metricId",schemaPath:"#/$defs/metricId/minLength",keyword:"minLength",params:{limit: 8},message:"must NOT have fewer than 8 characters"}];
return false;
}
else {
if(!pattern8.test(data5)){
validate50.errors = [{instancePath:instancePath+"/metricId",schemaPath:"#/$defs/metricId/pattern",keyword:"pattern",params:{pattern: "^metric_[a-z0-9]+(?:-[a-z0-9]+)*$"},message:"must match pattern \""+"^metric_[a-z0-9]+(?:-[a-z0-9]+)*$"+"\""}];
return false;
}
}
}
}
else {
validate50.errors = [{instancePath:instancePath+"/metricId",schemaPath:"#/$defs/metricId/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
}
var valid0 = _errs12 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.evidenceIds !== undefined){
let data6 = data.evidenceIds;
const _errs15 = errors;
if(errors === _errs15){
if(Array.isArray(data6)){
if(data6.length > 256){
validate50.errors = [{instancePath:instancePath+"/evidenceIds",schemaPath:"#/properties/evidenceIds/maxItems",keyword:"maxItems",params:{limit: 256},message:"must NOT have more than 256 items"}];
return false;
}
else {
if(data6.length < 1){
validate50.errors = [{instancePath:instancePath+"/evidenceIds",schemaPath:"#/properties/evidenceIds/minItems",keyword:"minItems",params:{limit: 1},message:"must NOT have fewer than 1 items"}];
return false;
}
else {
var valid5 = true;
const len0 = data6.length;
for(let i0=0; i0<len0; i0++){
let data7 = data6[i0];
const _errs17 = errors;
const _errs18 = errors;
if(errors === _errs18){
if(typeof data7 === "string"){
if(func2(data7) > 73){
validate50.errors = [{instancePath:instancePath+"/evidenceIds/" + i0,schemaPath:"#/$defs/evidenceId/maxLength",keyword:"maxLength",params:{limit: 73},message:"must NOT have more than 73 characters"}];
return false;
}
else {
if(func2(data7) < 10){
validate50.errors = [{instancePath:instancePath+"/evidenceIds/" + i0,schemaPath:"#/$defs/evidenceId/minLength",keyword:"minLength",params:{limit: 10},message:"must NOT have fewer than 10 characters"}];
return false;
}
else {
if(!pattern9.test(data7)){
validate50.errors = [{instancePath:instancePath+"/evidenceIds/" + i0,schemaPath:"#/$defs/evidenceId/pattern",keyword:"pattern",params:{pattern: "^evidence_[a-z0-9]+(?:-[a-z0-9]+)*$"},message:"must match pattern \""+"^evidence_[a-z0-9]+(?:-[a-z0-9]+)*$"+"\""}];
return false;
}
}
}
}
else {
validate50.errors = [{instancePath:instancePath+"/evidenceIds/" + i0,schemaPath:"#/$defs/evidenceId/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
}
var valid5 = _errs17 === errors;
if(!valid5){
break;
}
}
if(valid5){
let i1 = data6.length;
let j0;
if(i1 > 1){
outer0:
for(;i1--;){
for(j0 = i1; j0--;){
if(func0(data6[i1], data6[j0])){
validate50.errors = [{instancePath:instancePath+"/evidenceIds",schemaPath:"#/properties/evidenceIds/uniqueItems",keyword:"uniqueItems",params:{i: i1, j: j0},message:"must NOT have duplicate items (items ## "+j0+" and "+i1+" are identical)"}];
return false;
break outer0;
}
}
}
}
}
}
}
}
else {
validate50.errors = [{instancePath:instancePath+"/evidenceIds",schemaPath:"#/properties/evidenceIds/type",keyword:"type",params:{type: "array"},message:"must be array"}];
return false;
}
}
var valid0 = _errs15 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.judgmentRuleIds !== undefined){
const _errs20 = errors;
if(!(validate28(data.judgmentRuleIds, {instancePath:instancePath+"/judgmentRuleIds",parentData:data,parentDataProperty:"judgmentRuleIds",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate28.errors : vErrors.concat(validate28.errors);
errors = vErrors.length;
}
var valid0 = _errs20 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.narrativeRuleIds !== undefined){
const _errs21 = errors;
if(!(validate30(data.narrativeRuleIds, {instancePath:instancePath+"/narrativeRuleIds",parentData:data,parentDataProperty:"narrativeRuleIds",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate30.errors : vErrors.concat(validate30.errors);
errors = vErrors.length;
}
var valid0 = _errs21 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.label !== undefined){
let data10 = data.label;
const _errs22 = errors;
if(errors === _errs22){
if(typeof data10 === "string"){
if(func2(data10) > 160){
validate50.errors = [{instancePath:instancePath+"/label",schemaPath:"#/properties/label/maxLength",keyword:"maxLength",params:{limit: 160},message:"must NOT have more than 160 characters"}];
return false;
}
else {
if(func2(data10) < 1){
validate50.errors = [{instancePath:instancePath+"/label",schemaPath:"#/properties/label/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"}];
return false;
}
}
}
else {
validate50.errors = [{instancePath:instancePath+"/label",schemaPath:"#/properties/label/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
}
var valid0 = _errs22 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.visualVariant !== undefined){
let data11 = data.visualVariant;
const _errs24 = errors;
if(!((data11 === "metric-card") || (data11 === "metric-feature"))){
validate50.errors = [{instancePath:instancePath+"/visualVariant",schemaPath:"#/properties/visualVariant/enum",keyword:"enum",params:{allowedValues: schema64.properties.visualVariant.enum},message:"must be equal to one of the allowed values"}];
return false;
}
var valid0 = _errs24 === errors;
}
else {
var valid0 = true;
}
}
}
}
}
}
}
}
}
}
}
}
}
else {
validate50.errors = [{instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"}];
return false;
}
}
validate50.errors = vErrors;
return errors === 0;
}
validate50.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};


function validate43(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
let vErrors = null;
let errors = 0;
const evaluated0 = validate43.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
const _errs0 = errors;
let valid0 = false;
let passing0 = null;
const _errs1 = errors;
if(!(validate44(data, {instancePath,parentData,parentDataProperty,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate44.errors : vErrors.concat(validate44.errors);
errors = vErrors.length;
}
var _valid0 = _errs1 === errors;
if(_valid0){
valid0 = true;
passing0 = 0;
var props0 = true;
}
const _errs2 = errors;
if(!(validate50(data, {instancePath,parentData,parentDataProperty,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate50.errors : vErrors.concat(validate50.errors);
errors = vErrors.length;
}
var _valid0 = _errs2 === errors;
if(_valid0 && valid0){
valid0 = false;
passing0 = [passing0, 1];
}
else {
if(_valid0){
valid0 = true;
passing0 = 1;
if(props0 !== true){
props0 = true;
}
}
}
if(!valid0){
const err0 = {instancePath,schemaPath:"#/oneOf",keyword:"oneOf",params:{passingSchemas: passing0},message:"must match exactly one schema in oneOf"};
if(vErrors === null){
vErrors = [err0];
}
else {
vErrors.push(err0);
}
errors++;
validate43.errors = vErrors;
return false;
}
else {
errors = _errs0;
if(vErrors !== null){
if(_errs0){
vErrors.length = _errs0;
}
else {
vErrors = null;
}
}
}
validate43.errors = vErrors;
evaluated0.props = props0;
return errors === 0;
}
validate43.evaluated = {"dynamicProps":true,"dynamicItems":false};


function validate20(data, {instancePath="", parentData, parentDataProperty, rootData=data, dynamicAnchors={}}={}){
/*# sourceURL="urn:datapulse:story-blueprint:experimental:0.1.0" */;
let vErrors = null;
let errors = 0;
const evaluated0 = validate20.evaluated;
if(evaluated0.dynamicProps){
evaluated0.props = undefined;
}
if(evaluated0.dynamicItems){
evaluated0.items = undefined;
}
if(errors === 0){
if(data && typeof data == "object" && !Array.isArray(data)){
let missing0;
if((((((((((((data.schemaVersion === undefined) && (missing0 = "schemaVersion")) || ((data.storyId === undefined) && (missing0 = "storyId"))) || ((data.datasetVersionId === undefined) && (missing0 = "datasetVersionId"))) || ((data.reportGoal === undefined) && (missing0 = "reportGoal"))) || ((data.storyTimezone === undefined) && (missing0 = "storyTimezone"))) || ((data.references === undefined) && (missing0 = "references"))) || ((data.conditions === undefined) && (missing0 = "conditions"))) || ((data.globalConditionIds === undefined) && (missing0 = "globalConditionIds"))) || ((data.theme === undefined) && (missing0 = "theme"))) || ((data.visual === undefined) && (missing0 = "visual"))) || ((data.blocks === undefined) && (missing0 = "blocks"))){
validate20.errors = [{instancePath,schemaPath:"#/required",keyword:"required",params:{missingProperty: missing0},message:"must have required property '"+missing0+"'"}];
return false;
}
else {
const _errs1 = errors;
for(const key0 in data){
if(!(func1.call(schema31.properties, key0))){
validate20.errors = [{instancePath,schemaPath:"#/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key0},message:"must NOT have additional properties"}];
return false;
break;
}
}
if(_errs1 === errors){
if(data.schemaVersion !== undefined){
const _errs2 = errors;
if("0.1.0" !== data.schemaVersion){
validate20.errors = [{instancePath:instancePath+"/schemaVersion",schemaPath:"#/properties/schemaVersion/const",keyword:"const",params:{allowedValue: "0.1.0"},message:"must be equal to constant"}];
return false;
}
var valid0 = _errs2 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.storyId !== undefined){
let data1 = data.storyId;
const _errs3 = errors;
const _errs4 = errors;
if(errors === _errs4){
if(typeof data1 === "string"){
if(func2(data1) > 70){
validate20.errors = [{instancePath:instancePath+"/storyId",schemaPath:"#/$defs/storyId/maxLength",keyword:"maxLength",params:{limit: 70},message:"must NOT have more than 70 characters"}];
return false;
}
else {
if(func2(data1) < 7){
validate20.errors = [{instancePath:instancePath+"/storyId",schemaPath:"#/$defs/storyId/minLength",keyword:"minLength",params:{limit: 7},message:"must NOT have fewer than 7 characters"}];
return false;
}
else {
if(!pattern4.test(data1)){
validate20.errors = [{instancePath:instancePath+"/storyId",schemaPath:"#/$defs/storyId/pattern",keyword:"pattern",params:{pattern: "^story_[a-z0-9]+(?:-[a-z0-9]+)*$"},message:"must match pattern \""+"^story_[a-z0-9]+(?:-[a-z0-9]+)*$"+"\""}];
return false;
}
}
}
}
else {
validate20.errors = [{instancePath:instancePath+"/storyId",schemaPath:"#/$defs/storyId/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
}
var valid0 = _errs3 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.datasetVersionId !== undefined){
let data2 = data.datasetVersionId;
const _errs6 = errors;
const _errs7 = errors;
if(errors === _errs7){
if(typeof data2 === "string"){
if(func2(data2) > 80){
validate20.errors = [{instancePath:instancePath+"/datasetVersionId",schemaPath:"#/$defs/datasetVersionId/maxLength",keyword:"maxLength",params:{limit: 80},message:"must NOT have more than 80 characters"}];
return false;
}
else {
if(func2(data2) < 17){
validate20.errors = [{instancePath:instancePath+"/datasetVersionId",schemaPath:"#/$defs/datasetVersionId/minLength",keyword:"minLength",params:{limit: 17},message:"must NOT have fewer than 17 characters"}];
return false;
}
else {
if(!pattern5.test(data2)){
validate20.errors = [{instancePath:instancePath+"/datasetVersionId",schemaPath:"#/$defs/datasetVersionId/pattern",keyword:"pattern",params:{pattern: "^dataset_version_[a-z0-9]+(?:-[a-z0-9]+)*$"},message:"must match pattern \""+"^dataset_version_[a-z0-9]+(?:-[a-z0-9]+)*$"+"\""}];
return false;
}
}
}
}
else {
validate20.errors = [{instancePath:instancePath+"/datasetVersionId",schemaPath:"#/$defs/datasetVersionId/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
}
var valid0 = _errs6 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.reportGoal !== undefined){
let data3 = data.reportGoal;
const _errs9 = errors;
if(errors === _errs9){
if(typeof data3 === "string"){
if(func2(data3) > 1000){
validate20.errors = [{instancePath:instancePath+"/reportGoal",schemaPath:"#/properties/reportGoal/maxLength",keyword:"maxLength",params:{limit: 1000},message:"must NOT have more than 1000 characters"}];
return false;
}
else {
if(func2(data3) < 1){
validate20.errors = [{instancePath:instancePath+"/reportGoal",schemaPath:"#/properties/reportGoal/minLength",keyword:"minLength",params:{limit: 1},message:"must NOT have fewer than 1 characters"}];
return false;
}
}
}
else {
validate20.errors = [{instancePath:instancePath+"/reportGoal",schemaPath:"#/properties/reportGoal/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
}
var valid0 = _errs9 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.storyTimezone !== undefined){
let data4 = data.storyTimezone;
const _errs11 = errors;
if(errors === _errs11){
if(typeof data4 === "string"){
if(func2(data4) > 64){
validate20.errors = [{instancePath:instancePath+"/storyTimezone",schemaPath:"#/properties/storyTimezone/maxLength",keyword:"maxLength",params:{limit: 64},message:"must NOT have more than 64 characters"}];
return false;
}
else {
if(func2(data4) < 3){
validate20.errors = [{instancePath:instancePath+"/storyTimezone",schemaPath:"#/properties/storyTimezone/minLength",keyword:"minLength",params:{limit: 3},message:"must NOT have fewer than 3 characters"}];
return false;
}
else {
if(!pattern6.test(data4)){
validate20.errors = [{instancePath:instancePath+"/storyTimezone",schemaPath:"#/properties/storyTimezone/pattern",keyword:"pattern",params:{pattern: "^(?:UTC|[A-Za-z_]+(?:/[A-Za-z0-9_+.-]+)+)$"},message:"must match pattern \""+"^(?:UTC|[A-Za-z_]+(?:/[A-Za-z0-9_+.-]+)+)$"+"\""}];
return false;
}
}
}
}
else {
validate20.errors = [{instancePath:instancePath+"/storyTimezone",schemaPath:"#/properties/storyTimezone/type",keyword:"type",params:{type: "string"},message:"must be string"}];
return false;
}
}
var valid0 = _errs11 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.references !== undefined){
const _errs13 = errors;
if(!(validate21(data.references, {instancePath:instancePath+"/references",parentData:data,parentDataProperty:"references",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate21.errors : vErrors.concat(validate21.errors);
errors = vErrors.length;
}
var valid0 = _errs13 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.conditions !== undefined){
let data6 = data.conditions;
const _errs14 = errors;
if(errors === _errs14){
if(Array.isArray(data6)){
if(data6.length > 64){
validate20.errors = [{instancePath:instancePath+"/conditions",schemaPath:"#/properties/conditions/maxItems",keyword:"maxItems",params:{limit: 64},message:"must NOT have more than 64 items"}];
return false;
}
else {
var valid3 = true;
const len0 = data6.length;
for(let i0=0; i0<len0; i0++){
const _errs16 = errors;
if(!(validate33(data6[i0], {instancePath:instancePath+"/conditions/" + i0,parentData:data6,parentDataProperty:i0,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate33.errors : vErrors.concat(validate33.errors);
errors = vErrors.length;
}
var valid3 = _errs16 === errors;
if(!valid3){
break;
}
}
}
}
else {
validate20.errors = [{instancePath:instancePath+"/conditions",schemaPath:"#/properties/conditions/type",keyword:"type",params:{type: "array"},message:"must be array"}];
return false;
}
}
var valid0 = _errs14 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.globalConditionIds !== undefined){
const _errs17 = errors;
if(!(validate41(data.globalConditionIds, {instancePath:instancePath+"/globalConditionIds",parentData:data,parentDataProperty:"globalConditionIds",rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate41.errors : vErrors.concat(validate41.errors);
errors = vErrors.length;
}
var valid0 = _errs17 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.theme !== undefined){
let data9 = data.theme;
const _errs18 = errors;
const _errs19 = errors;
if(errors === _errs19){
if(data9 && typeof data9 == "object" && !Array.isArray(data9)){
let missing1;
if((data9.themeId === undefined) && (missing1 = "themeId")){
validate20.errors = [{instancePath:instancePath+"/theme",schemaPath:"#/$defs/theme/required",keyword:"required",params:{missingProperty: missing1},message:"must have required property '"+missing1+"'"}];
return false;
}
else {
const _errs21 = errors;
for(const key1 in data9){
if(!(key1 === "themeId")){
validate20.errors = [{instancePath:instancePath+"/theme",schemaPath:"#/$defs/theme/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key1},message:"must NOT have additional properties"}];
return false;
break;
}
}
if(_errs21 === errors){
if(data9.themeId !== undefined){
let data10 = data9.themeId;
if(!((((data10 === "deep-space-neon") || (data10 === "soft-glass")) || (data10 === "data-editorial")) || (data10 === "enterprise-minimal"))){
validate20.errors = [{instancePath:instancePath+"/theme/themeId",schemaPath:"#/$defs/theme/properties/themeId/enum",keyword:"enum",params:{allowedValues: schema58.properties.themeId.enum},message:"must be equal to one of the allowed values"}];
return false;
}
}
}
}
}
else {
validate20.errors = [{instancePath:instancePath+"/theme",schemaPath:"#/$defs/theme/type",keyword:"type",params:{type: "object"},message:"must be object"}];
return false;
}
}
var valid0 = _errs18 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.visual !== undefined){
let data11 = data.visual;
const _errs23 = errors;
const _errs24 = errors;
if(errors === _errs24){
if(data11 && typeof data11 == "object" && !Array.isArray(data11)){
let missing2;
if((((data11.renderMode === undefined) && (missing2 = "renderMode")) || ((data11.scenePreset === undefined) && (missing2 = "scenePreset"))) || ((data11.motionPreset === undefined) && (missing2 = "motionPreset"))){
validate20.errors = [{instancePath:instancePath+"/visual",schemaPath:"#/$defs/storyVisual/required",keyword:"required",params:{missingProperty: missing2},message:"must have required property '"+missing2+"'"}];
return false;
}
else {
const _errs26 = errors;
for(const key2 in data11){
if(!(((key2 === "renderMode") || (key2 === "scenePreset")) || (key2 === "motionPreset"))){
validate20.errors = [{instancePath:instancePath+"/visual",schemaPath:"#/$defs/storyVisual/additionalProperties",keyword:"additionalProperties",params:{additionalProperty: key2},message:"must NOT have additional properties"}];
return false;
break;
}
}
if(_errs26 === errors){
if(data11.renderMode !== undefined){
const _errs27 = errors;
if("2d" !== data11.renderMode){
validate20.errors = [{instancePath:instancePath+"/visual/renderMode",schemaPath:"#/$defs/storyVisual/properties/renderMode/const",keyword:"const",params:{allowedValue: "2d"},message:"must be equal to constant"}];
return false;
}
var valid7 = _errs27 === errors;
}
else {
var valid7 = true;
}
if(valid7){
if(data11.scenePreset !== undefined){
const _errs28 = errors;
if("none" !== data11.scenePreset){
validate20.errors = [{instancePath:instancePath+"/visual/scenePreset",schemaPath:"#/$defs/storyVisual/properties/scenePreset/const",keyword:"const",params:{allowedValue: "none"},message:"must be equal to constant"}];
return false;
}
var valid7 = _errs28 === errors;
}
else {
var valid7 = true;
}
if(valid7){
if(data11.motionPreset !== undefined){
const _errs29 = errors;
if("none" !== data11.motionPreset){
validate20.errors = [{instancePath:instancePath+"/visual/motionPreset",schemaPath:"#/$defs/storyVisual/properties/motionPreset/const",keyword:"const",params:{allowedValue: "none"},message:"must be equal to constant"}];
return false;
}
var valid7 = _errs29 === errors;
}
else {
var valid7 = true;
}
}
}
}
}
}
else {
validate20.errors = [{instancePath:instancePath+"/visual",schemaPath:"#/$defs/storyVisual/type",keyword:"type",params:{type: "object"},message:"must be object"}];
return false;
}
}
var valid0 = _errs23 === errors;
}
else {
var valid0 = true;
}
if(valid0){
if(data.blocks !== undefined){
let data15 = data.blocks;
const _errs30 = errors;
if(errors === _errs30){
if(Array.isArray(data15)){
if(data15.length > 64){
validate20.errors = [{instancePath:instancePath+"/blocks",schemaPath:"#/properties/blocks/maxItems",keyword:"maxItems",params:{limit: 64},message:"must NOT have more than 64 items"}];
return false;
}
else {
if(data15.length < 1){
validate20.errors = [{instancePath:instancePath+"/blocks",schemaPath:"#/properties/blocks/minItems",keyword:"minItems",params:{limit: 1},message:"must NOT have fewer than 1 items"}];
return false;
}
else {
var valid8 = true;
const len1 = data15.length;
for(let i1=0; i1<len1; i1++){
const _errs32 = errors;
if(!(validate43(data15[i1], {instancePath:instancePath+"/blocks/" + i1,parentData:data15,parentDataProperty:i1,rootData,dynamicAnchors}))){
vErrors = vErrors === null ? validate43.errors : vErrors.concat(validate43.errors);
errors = vErrors.length;
}
var valid8 = _errs32 === errors;
if(!valid8){
break;
}
}
}
}
}
else {
validate20.errors = [{instancePath:instancePath+"/blocks",schemaPath:"#/properties/blocks/type",keyword:"type",params:{type: "array"},message:"must be array"}];
return false;
}
}
var valid0 = _errs30 === errors;
}
else {
var valid0 = true;
}
}
}
}
}
}
}
}
}
}
}
}
}
}
else {
validate20.errors = [{instancePath,schemaPath:"#/type",keyword:"type",params:{type: "object"},message:"must be object"}];
return false;
}
}
validate20.errors = vErrors;
return errors === 0;
}
validate20.evaluated = {"props":true,"dynamicProps":false,"dynamicItems":false};
