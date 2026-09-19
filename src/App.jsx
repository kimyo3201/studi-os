import { useState, useEffect, useRef, useCallback } from "react";

// ── 상수 ──────────────────────────────────────────────────────────────────────
const SUBJECTS = ["수학","영어","국어","과학","사회","한국사","물리","화학","생물","지구과학","기타"];

// 계획 실패 사유 코드 — 하루의 실패 원인을 한 번만 태깅해 여러 계획에 적용할 수 있음
const FAIL_REASONS = {
  TIME:       { label:"시간 부족/계획 과다", desc:"할 수 있는 시간보다 계획량이 많았음", color:"#f59e0b" },
  FATIGUE:    { label:"체력/집중력 소진", desc:"피로·졸림·집중 붕괴로 수행하지 못함", color:"#ef4444" },
  INTERRUPT:  { label:"돌발 일정/환경", desc:"예상하지 못한 일정·이동·환경 변수", color:"#06b6d4" },
  DIFFICULTY: { label:"예상보다 어려움", desc:"난이도나 소요 시간을 과소평가함", color:"#a855f7" },
  AVOID:      { label:"회피/딴짓", desc:"해야 했지만 미루거나 다른 행동으로 빠짐", color:"#dc2626" },
  PRIORITY:   { label:"우선순위 변경", desc:"더 중요한 공부를 먼저 하느라 밀림", color:"#3b82f6" },
  SKIP:       { label:"그냥 안 함", desc:"뚜렷한 외부 이유 없이 실행하지 않음", color:"#6b7280" },
};

// 계획을 "삭제"할 때도 이유를 남긴다. 화면에서는 사라지지만 plans2 안에는
// 원본 계획은 실제 삭제(tombstone)하고 별도 삭제 로그를 남겨 리포트에서 원인을 분석한다.
const DELETE_REASONS = {
  TIME:         { label:"시간 부족", desc:"시간이 없어 이번 계획을 아예 제거", color:"#f59e0b" },
  LOW_PRIORITY: { label:"중요도 낮음", desc:"지금 할 가치가 낮아 계획에서 제거", color:"#64748b" },
  REPLACED:     { label:"다른 계획으로 대체", desc:"더 적절한 공부/계획으로 교체", color:"#3b82f6" },
  NOT_NEEDED:   { label:"더 이상 필요 없음", desc:"이미 해결됐거나 할 필요가 없어짐", color:"#22c55e" },
  DUPLICATE:    { label:"중복/잘못 추가", desc:"중복 등록 또는 입력 실수", color:"#a855f7" },
  OTHER:        { label:"기타", desc:"위 항목에 해당하지 않음", color:"#6b7280" },
};

const SUBJECT_COLORS = {
  "전과목 공통": { bg:"#818cf8", light:"#818cf830", text:"#c7d2fe" }, // 인디고
  수학:   { bg:"#eab308", light:"#eab30830", text:"#fde047" }, // 노랑
  영어:   { bg:"#a855f7", light:"#a855f730", text:"#d8b4fe" }, // 보라
  국어:   { bg:"#ef4444", light:"#ef444430", text:"#fca5a5" }, // 빨강
  과학:   { bg:"#3b82f6", light:"#3b82f630", text:"#93c5fd" }, // 파랑
  사회:   { bg:"#9ca3af", light:"#9ca3af30", text:"#e5e7eb" }, // 회색
  한국사: { bg:"#22c55e", light:"#22c55e30", text:"#86efac" }, // 초록
  물리:   { bg:"#06b6d4", light:"#06b6d430", text:"#67e8f9" }, // 시안
  화학:   { bg:"#f97316", light:"#f9731630", text:"#fdba74" }, // 주황
  생물:   { bg:"#14b8a6", light:"#14b8a630", text:"#5eead4" }, // 청록
  지구과학:{ bg:"#ec4899", light:"#ec489930", text:"#f9a8d4" }, // 핑크
  기타:   { bg:"#64748b", light:"#64748b30", text:"#cbd5e1" }, // 슬레이트
};
const ERROR_CODES = {
  "XC-N":{ desc:"신규 개념", detail:"문제 풀며 처음 얻은 새 개념", color:"#f97316" },
  "XC":  { desc:"개념 누락", detail:"배웠는데 까먹었거나 모르는 개념", color:"#ef4444" },
  "XM-F":{ desc:"정독 누락", detail:"1번 정독 안 해서 조건·답 놓침", color:"#a78bfa" },
  "XM-T/F":{ desc:"참/거짓 체크", detail:"옳은것/옳지않은것 헷갈림", color:"#06b6d4" },
  "XM-V":{ desc:"검토 누락", detail:"풀이·답 재검토 안 함", color:"#3b82f6" },
  "XJ":  { desc:"적용 오류", detail:"개념은 아는데 적용을 못함", color:"#10b981" },
};
// 대분류: XC(개념) / XM(정독·검토) / XJ(적용) — 오답 폴더 상위 그룹핑에 사용
const ERROR_MAJOR = {
  "XC-N":"XC", "XC":"XC",
  "XM-F":"XM", "XM-T/F":"XM", "XM-V":"XM",
  "XJ":"XJ",
};
const ERROR_MAJOR_LABEL = {
  XC: { label:"XC — 개념", desc:"신규 개념 습득 / 개념 누락", color:"#ef4444" },
  XM: { label:"XM — 정독·검토", desc:"정독 누락 / 참거짓 체크 / 검토 누락", color:"#3b82f6" },
  XJ: { label:"XJ — 적용", desc:"개념은 알지만 적용을 못함", color:"#10b981" },
};
const STORAGE_KEY = "studyos_v6";
const LEGACY_STORAGE_KEY = "studyos_v5";
const SLOT_H = 22; // px per 10min slot
const SLOTS_PER_HOUR = 6;
const START_HOUR = 6;
const TOTAL_HOURS = 24;
const TOTAL_SLOTS = TOTAL_HOURS * SLOTS_PER_HOUR; // 144

const initialData = {
  timetable: {},      // { "2024-01-01": { [slotIdx]: subjectName } }
  plans: {},          // { "2024-01-01": "오늘 계획 텍스트" }
  wrongs: [],
  folderNames: {},
  weekGoals: {},       // { "2024-W03": "이번 주 목표 텍스트" } -- 구버전, 마이그레이션용
  monthGoals: {},      // { "2024-01": "이번 달 목표 텍스트" } -- 구버전, 마이그레이션용
  goalItems: [],        // 상세 목표 항목들: { id, scope:"week"|"month", scopeKey, subject, content, difficulty, status, note }
  nightNotes: {},       // 밤 마무리 한줄: { "2024-01-01": "오늘 한줄 메모" }
};

// ISO 주차 키 계산 (월요일 시작 기준)
function getWeekKey(dateStr) {
  const d = new Date(dateStr);
  const day = d.getDay();
  const monday = new Date(d);
  monday.setDate(d.getDate() - (day===0?6:day-1));
  const year = monday.getFullYear();
  const jan1 = new Date(year,0,1);
  const week = Math.ceil((((monday-jan1)/86400000) + jan1.getDay()+1)/7);
  return `${year}-W${String(week).padStart(2,"0")}`;
}
function getMonthKey(dateStr) {
  return dateStr.slice(0,7); // "2024-01"
}

function loadCurrentFallback() {
  try {
    const r = localStorage.getItem(STORAGE_KEY);
    return r ? JSON.parse(r) : null;
  } catch { return null; }
}
function loadLegacyFallback() {
  try {
    const r = localStorage.getItem(LEGACY_STORAGE_KEY);
    return r ? JSON.parse(r) : null;
  } catch { return null; }
}
function loadFallback() {
  return loadCurrentFallback() || loadLegacyFallback() || initialData;
}

// ── 동기화 v3: 오프라인 우선 + 항목/슬롯 단위 병합 + 삭제 tombstone + CAS ────────
// 설계 목표
// 1) 화면 데이터 구조는 그대로 유지한다. 기존 UI/리포트/계획/오답 기능을 건드리지 않는다.
// 2) 로컬 원본은 IndexedDB(사진 포함), localStorage는 즉시 복구 가능한 경량 fallback이다.
// 3) 배열형 데이터는 항목 id 단위, 일반 map은 key 단위, timetable은 10분 slot 단위로 버전 관리한다.
// 4) 삭제는 tombstone으로 남겨 오래된 탭/기기가 삭제 항목을 되살리지 못하게 한다.
// 5) 클라우드 저장은 updated_at CAS(낙관적 잠금)만 사용한다. 충돌 시 재조회→병합→재시도한다.
// 6) 네트워크 복귀 시 현재 메모리를 바로 업로드하지 않고 반드시 서버 최신본과 먼저 병합한다.
const SYNC_SCHEMA = 3;
// v3는 새 IndexedDB를 사용하고, 최초 1회만 v2 IndexedDB를 읽어 마이그레이션한다.
const IDB_NAME = "studyos_v3";
const LEGACY_IDB_NAME = "studyos_v2";
const IDB_STORE = "state";
const IDB_KEY = "main";
const CLIENT_ID_KEY = "studyos_client_id_v2";
const ARRAY_ENTITY_FIELDS = ["wrongs", "plans2", "goalItems"];
const MAP_ENTITY_FIELDS = ["plans", "folderNames", "weekGoals", "monthGoals", "nightNotes"];
const TIMETABLE_FIELD = "timetable";

function makeRandomId() {
  try { return crypto.randomUUID(); }
  catch { return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`; }
}
function getClientId() {
  try {
    let id = localStorage.getItem(CLIENT_ID_KEY);
    if (!id) {
      id = makeRandomId();
      localStorage.setItem(CLIENT_ID_KEY, id);
    }
    return id;
  } catch { return makeRandomId(); }
}
const CLIENT_ID = getClientId();
const SESSION_ID = makeRandomId();
let lastVersionMs = 0;
let versionCounter = 0;

function nextSyncVersion() {
  const now = Date.now();
  if (now === lastVersionMs) versionCounter += 1;
  else { lastVersionMs = now; versionCounter = 0; }
  return `${String(now).padStart(15,"0")}:${String(versionCounter).padStart(6,"0")}:${CLIENT_ID}:${SESSION_ID}`;
}
function legacyVersion(ms=0, source="legacy") {
  const n = Number(ms)||0;
  return `${String(Math.max(0,Math.floor(n))).padStart(15,"0")}:000000:${source}:legacy`;
}
function cmpVersion(a="", b="") {
  if (a === b) return 0;
  return a > b ? 1 : -1;
}
function maxVersion(...values) {
  return values.reduce((best,v)=>cmpVersion(v||"",best||"")>0?(v||""):best, "");
}
function entityKey(field, id) { return `${field}:${String(id)}`; }
function timetableSlotKey(date, slot) { return `timetable:${date}:${String(slot)}`; }
function timetableDayDeleteKey(date) { return `timetable-day:${date}`; }
function hasOwn(obj,key){ return Object.prototype.hasOwnProperty.call(obj||{},key); }

function normalizeDataShape(d) {
  const src = d && typeof d === "object" ? d : {};
  return {
    ...initialData,
    ...src,
    timetable: src.timetable || {},
    plans: src.plans || {},
    wrongs: Array.isArray(src.wrongs) ? src.wrongs : [],
    folderNames: src.folderNames || {},
    weekGoals: src.weekGoals || {},
    monthGoals: src.monthGoals || {},
    goalItems: Array.isArray(src.goalItems) ? src.goalItems : [],
    nightNotes: src.nightNotes || {},
    plans2: Array.isArray(src.plans2) ? src.plans2 : [],
  };
}
function syncSchemaOf(d){ return Number(d?._sync?.schema)||0; }
function isSyncCurrent(d) { return syncSchemaOf(d) === SYNC_SCHEMA; }
function itemId(item, index, field) {
  if (item && item.id !== undefined && item.id !== null) return String(item.id);
  let text = "";
  try { text = JSON.stringify(item); } catch { text = String(item); }
  let h = 2166136261;
  for (let i=0;i<text.length;i++) { h ^= text.charCodeAt(i); h = Math.imul(h,16777619); }
  return `legacy-${field}-${index}-${(h>>>0).toString(36)}`;
}
function isEffectivelyEmpty(d) {
  if (!d) return true;
  return (
    Object.keys(d.timetable||{}).every(date=>Object.keys(d.timetable?.[date]||{}).length===0) &&
    Object.keys(d.plans||{}).length===0 &&
    (d.wrongs||[]).length===0 &&
    (d.plans2||[]).length===0 &&
    (d.goalItems||[]).length===0 &&
    Object.keys(d.nightNotes||{}).length===0 &&
    Object.keys(d.folderNames||{}).length===0 &&
    Object.keys(d.weekGoals||{}).length===0 &&
    Object.keys(d.monthGoals||{}).length===0
  );
}

// v1/v2/구버전 데이터를 v3 메타데이터로 감싼다. 사용자 데이터 값 자체는 바꾸지 않는다.
function ensureSyncMeta(raw, source="local") {
  const d = normalizeDataShape(raw);
  if (isSyncCurrent(d)) {
    return {
      ...d,
      _sync: {
        schema: SYNC_SCHEMA,
        entries: {...(d._sync.entries||{})},
        tombstones: {...(d._sync.tombstones||{})},
        lastChangeAt: Number(d._sync.lastChangeAt)||Number(d._syncedAt)||0,
        migratedFromLegacy: !!d._sync.migratedFromLegacy,
      },
    };
  }

  const oldSync = d._sync && typeof d._sync === "object" ? d._sync : {};
  const oldEntries = oldSync.entries || {};
  const oldTombstones = oldSync.tombstones || {};
  const baseMs = Number(oldSync.lastChangeAt)||Number(d._syncedAt)||0;
  const fallbackVersion = legacyVersion(baseMs, source);
  const entries = {};
  const tombstones = {};

  for (const field of ARRAY_ENTITY_FIELDS) {
    (d[field]||[]).forEach((item,i)=>{
      const id=itemId(item,i,field);
      const key=entityKey(field,id);
      entries[key]=oldEntries[key]||fallbackVersion;
    });
    const prefix=`${field}:`;
    for(const [key,v] of Object.entries(oldTombstones)) if(key.startsWith(prefix)) tombstones[key]=v||fallbackVersion;
  }

  for (const field of MAP_ENTITY_FIELDS) {
    Object.keys(d[field]||{}).forEach(id=>{
      const key=entityKey(field,id);
      entries[key]=oldEntries[key]||fallbackVersion;
    });
    const prefix=`${field}:`;
    for(const [key,v] of Object.entries(oldTombstones)) if(key.startsWith(prefix)) tombstones[key]=v||fallbackVersion;
  }

  // v2는 timetable을 날짜 전체 단위로 버전 관리했다. 그 버전을 각 slot에 그대로 펼쳐서 무손실 마이그레이션.
  for(const [date,slots] of Object.entries(d.timetable||{})){
    const oldDayKey=`timetable:${date}`;
    const dayVersion=oldEntries[oldDayKey]||fallbackVersion;
    for(const slot of Object.keys(slots||{})) entries[timetableSlotKey(date,slot)]=dayVersion;
  }
  for(const [key,v] of Object.entries(oldTombstones)){
    if(!key.startsWith("timetable:")) continue;
    const rest=key.slice("timetable:".length);
    // v2 tombstone은 date 하나만 있었다. v3에서는 날짜 전체 삭제 tombstone으로 승격한다.
    if(/^\d{4}-\d{2}-\d{2}$/.test(rest)) tombstones[timetableDayDeleteKey(rest)]=v||fallbackVersion;
    else tombstones[key]=v||fallbackVersion;
  }

  return {
    ...d,
    _sync: {
      schema: SYNC_SCHEMA,
      entries,
      tombstones,
      lastChangeAt: baseMs,
      migratedFromLegacy: true,
    },
  };
}

function sameValue(a,b) {
  if (a === b) return true;
  try { return JSON.stringify(a) === JSON.stringify(b); }
  catch { return false; }
}
function stableStringify(value) {
  const seen = new WeakSet();
  const walk = v => {
    if (v === null || typeof v !== "object") return v;
    if (seen.has(v)) return "[Circular]";
    seen.add(v);
    if (Array.isArray(v)) return v.map(walk);
    const out = {};
    Object.keys(v).sort().forEach(k=>{ out[k]=walk(v[k]); });
    return out;
  };
  try { return JSON.stringify(walk(value)); }
  catch { try { return JSON.stringify(value); } catch { return String(value); } }
}
function sameSnapshot(a,b) { return stableStringify(a) === stableStringify(b); }

// 모든 UI setData는 이 함수 하나를 통과한다. 화면 데이터 구조는 바꾸지 않고 메타데이터만 추가한다.
function stampLocalChanges(prevRaw, nextRaw) {
  const prev = ensureSyncMeta(prevRaw, "local");
  const next = normalizeDataShape(nextRaw);
  const entries = {...(prev._sync.entries||{})};
  const tombstones = {...(prev._sync.tombstones||{})};
  let changed = false;
  let lastChangeAt = Number(prev._sync.lastChangeAt)||0;

  const markPresent = key => {
    const v = nextSyncVersion();
    entries[key] = v;
    delete tombstones[key];
    changed = true;
    lastChangeAt = Date.now();
  };
  const markDeleted = key => {
    const v = nextSyncVersion();
    tombstones[key] = v;
    changed = true;
    lastChangeAt = Date.now();
  };

  for (const field of ARRAY_ENTITY_FIELDS) {
    const pArr = prev[field]||[], nArr = next[field]||[];
    const pMap = new Map(pArr.map((x,i)=>[itemId(x,i,field),x]));
    const nMap = new Map(nArr.map((x,i)=>[itemId(x,i,field),x]));
    const ids = new Set([...pMap.keys(), ...nMap.keys()]);
    ids.forEach(id=>{
      const key = entityKey(field,id);
      const hasP = pMap.has(id), hasN = nMap.has(id);
      if (hasP && !hasN) markDeleted(key);
      else if (!hasP && hasN) markPresent(key);
      else if (hasP && hasN && !sameValue(pMap.get(id),nMap.get(id))) markPresent(key);
    });
  }

  for (const field of MAP_ENTITY_FIELDS) {
    const pMap = prev[field]||{}, nMap = next[field]||{};
    const keys = new Set([...Object.keys(pMap), ...Object.keys(nMap)]);
    keys.forEach(id=>{
      const key = entityKey(field,id);
      const hasP = hasOwn(pMap,id), hasN = hasOwn(nMap,id);
      if (hasP && !hasN) markDeleted(key);
      else if (!hasP && hasN) markPresent(key);
      else if (hasP && hasN && !sameValue(pMap[id],nMap[id])) markPresent(key);
    });
  }

  // timetable은 날짜가 아니라 10분 slot 하나가 충돌 단위다.
  const pTT=prev.timetable||{}, nTT=next.timetable||{};
  const dates=new Set([...Object.keys(pTT),...Object.keys(nTT)]);
  dates.forEach(date=>{
    const hadDay=hasOwn(pTT,date), hasDay=hasOwn(nTT,date);
    const pDay=pTT[date]||{}, nDay=nTT[date]||{};
    if(hadDay && !hasDay) {
      // '날짜 전체 초기화'는 원격의 오래된 미확인 slot까지 되살아나지 않도록 day tombstone도 남긴다.
      markDeleted(timetableDayDeleteKey(date));
    }
    const slots=new Set([...Object.keys(pDay),...Object.keys(nDay)]);
    slots.forEach(slot=>{
      const key=timetableSlotKey(date,slot);
      const hasP=hasOwn(pDay,slot), hasN=hasOwn(nDay,slot);
      if(hasP && !hasN) markDeleted(key);
      else if(!hasP && hasN) markPresent(key);
      else if(hasP && hasN && !sameValue(pDay[slot],nDay[slot])) markPresent(key);
    });
  });

  if (!changed) return {
    ...next,
    _sync: {...prev._sync, entries, tombstones, schema:SYNC_SCHEMA},
    _syncedAt: prev._syncedAt||0,
  };

  return {
    ...next,
    _sync: {
      schema: SYNC_SCHEMA,
      entries,
      tombstones,
      lastChangeAt,
      migratedFromLegacy: false,
    },
    _syncedAt: lastChangeAt,
  };
}

function getArrayMap(d, field) {
  const arr=d[field]||[];
  const map=new Map();
  arr.forEach((x,i)=>map.set(itemId(x,i,field),x));
  return {arr,map};
}
function collectMetaIds(sync, field) {
  const prefix=`${field}:`;
  const ids=[];
  for (const k of Object.keys(sync.entries||{})) if(k.startsWith(prefix)) ids.push(k.slice(prefix.length));
  for (const k of Object.keys(sync.tombstones||{})) if(k.startsWith(prefix)) ids.push(k.slice(prefix.length));
  return ids;
}
function collectTimetableSlotIds(d){
  const ids=[];
  for(const [date,slots] of Object.entries(d.timetable||{})){
    for(const slot of Object.keys(slots||{})) ids.push(`${date}:${slot}`);
  }
  const prefix="timetable:";
  for(const k of Object.keys(d._sync?.entries||{})) if(k.startsWith(prefix)) ids.push(k.slice(prefix.length));
  for(const k of Object.keys(d._sync?.tombstones||{})) if(k.startsWith(prefix)) ids.push(k.slice(prefix.length));
  return ids;
}
function splitTimetableSlotId(id){
  const m=String(id).match(/^(\d{4}-\d{2}-\d{2}):(.*)$/);
  return m ? {date:m[1],slot:m[2]} : null;
}

// 최신 스냅샷 하나를 고르는 대신 각 엔티티/slot을 독립적으로 병합한다.
function mergeSyncData(aRaw,bRaw) {
  const a=ensureSyncMeta(aRaw,"local"), b=ensureSyncMeta(bRaw,"cloud");
  const out=normalizeDataShape(a);
  const entries={};
  const tombstones={};

  for (const field of ARRAY_ENTITY_FIELDS) {
    const A=getArrayMap(a,field), B=getArrayMap(b,field);
    const order=[];
    [...A.map.keys(),...B.map.keys(),...collectMetaIds(a._sync,field),...collectMetaIds(b._sync,field)].forEach(id=>{
      if(!order.includes(id)) order.push(id);
    });
    const result=[];
    order.forEach(id=>{
      const key=entityKey(field,id);
      const ae=a._sync.entries?.[key]||"", be=b._sync.entries?.[key]||"";
      const at=a._sync.tombstones?.[key]||"", bt=b._sync.tombstones?.[key]||"";
      const ev=maxVersion(ae,be), tv=maxVersion(at,bt);
      if(ev) entries[key]=ev;
      if(tv) tombstones[key]=tv;
      if(tv && cmpVersion(tv,ev)>=0) return;

      let chosen=null;
      if(cmpVersion(ae,be)>0) chosen=A.map.get(id)||B.map.get(id)||null;
      else if(cmpVersion(be,ae)>0) chosen=B.map.get(id)||A.map.get(id)||null;
      else {
        const av=A.map.get(id), bv=B.map.get(id);
        if(av && bv && field==="wrongs") {
          // localStorage fallback은 사진을 빼므로 같은 버전이면 사진이 있는 쪽을 우선 복원한다.
          chosen={...bv,...av};
          if(!chosen.photo && bv.photo) chosen.photo=bv.photo;
        } else chosen=av||bv||null;
      }
      if(chosen) result.push(chosen);
    });
    out[field]=result;
  }

  for (const field of MAP_ENTITY_FIELDS) {
    const A=a[field]||{}, B=b[field]||{};
    const ids=[];
    [...Object.keys(A),...Object.keys(B),...collectMetaIds(a._sync,field),...collectMetaIds(b._sync,field)].forEach(id=>{
      if(!ids.includes(id)) ids.push(id);
    });
    const result={};
    ids.forEach(id=>{
      const key=entityKey(field,id);
      const ae=a._sync.entries?.[key]||"", be=b._sync.entries?.[key]||"";
      const at=a._sync.tombstones?.[key]||"", bt=b._sync.tombstones?.[key]||"";
      const ev=maxVersion(ae,be), tv=maxVersion(at,bt);
      if(ev) entries[key]=ev;
      if(tv) tombstones[key]=tv;
      if(tv && cmpVersion(tv,ev)>=0) return;
      if(cmpVersion(ae,be)>0) {
        if(hasOwn(A,id)) result[id]=A[id]; else if(hasOwn(B,id)) result[id]=B[id];
      } else if(cmpVersion(be,ae)>0) {
        if(hasOwn(B,id)) result[id]=B[id]; else if(hasOwn(A,id)) result[id]=A[id];
      } else {
        if(hasOwn(A,id)) result[id]=A[id]; else if(hasOwn(B,id)) result[id]=B[id];
      }
    });
    out[field]=result;
  }

  // timetable: 같은 날짜를 두 기기에서 동시에 기록해도 서로 다른 10분 slot은 둘 다 살아남는다.
  const ttResult={};
  const ttIds=[];
  [...collectTimetableSlotIds(a),...collectTimetableSlotIds(b)].forEach(id=>{ if(!ttIds.includes(id)) ttIds.push(id); });
  ttIds.forEach(id=>{
    const parsed=splitTimetableSlotId(id);
    if(!parsed) return;
    const {date,slot}=parsed;
    const key=timetableSlotKey(date,slot);
    const dayKey=timetableDayDeleteKey(date);
    const ae=a._sync.entries?.[key]||"", be=b._sync.entries?.[key]||"";
    const at=a._sync.tombstones?.[key]||"", bt=b._sync.tombstones?.[key]||"";
    const ad=a._sync.tombstones?.[dayKey]||"", bd=b._sync.tombstones?.[dayKey]||"";
    const ev=maxVersion(ae,be), tv=maxVersion(at,bt,ad,bd);
    if(ev) entries[key]=ev;
    const slotTomb=maxVersion(at,bt);
    if(slotTomb) tombstones[key]=slotTomb;
    const dayTomb=maxVersion(ad,bd);
    if(dayTomb) tombstones[dayKey]=dayTomb;
    if(tv && cmpVersion(tv,ev)>=0) return;

    const av=a.timetable?.[date]?.[slot], bv=b.timetable?.[date]?.[slot];
    let chosen;
    if(cmpVersion(ae,be)>0) chosen=av!==undefined?av:bv;
    else if(cmpVersion(be,ae)>0) chosen=bv!==undefined?bv:av;
    else chosen=av!==undefined?av:bv;
    if(chosen!==undefined){
      if(!ttResult[date]) ttResult[date]={};
      ttResult[date][slot]=chosen;
    }
  });
  // day tombstone은 slot이 하나도 없어도 보존해야 과거 기기에서 해당 날짜가 부활하지 않는다.
  const dayPrefix="timetable-day:";
  for(const key of new Set([...Object.keys(a._sync.tombstones||{}),...Object.keys(b._sync.tombstones||{})])){
    if(key.startsWith(dayPrefix)){
      const v=maxVersion(a._sync.tombstones?.[key]||"",b._sync.tombstones?.[key]||"");
      if(v) tombstones[key]=v;
    }
  }
  out.timetable=ttResult;

  const lastChangeAt=Math.max(
    Number(a._sync.lastChangeAt)||0,
    Number(b._sync.lastChangeAt)||0,
    Number(a._syncedAt)||0,
    Number(b._syncedAt)||0
  );
  out._sync={
    schema:SYNC_SCHEMA,
    entries,
    tombstones,
    lastChangeAt,
    migratedFromLegacy:!!(a._sync.migratedFromLegacy&&b._sync.migratedFromLegacy),
  };
  out._syncedAt=lastChangeAt;
  return out;
}

// localStorage는 동기식 비상 복사본. 사진 원본은 IndexedDB에 보관한다.
function stripHeavyData(d) {
  return {
    ...d,
    wrongs: (d.wrongs||[]).map(w => {
      const { photo, ...rest } = w;
      return photo ? { ...rest, _hasPhoto: true } : w;
    }),
  };
}
function saveFallback(d) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(stripHeavyData(d))); }
  catch(err) { console.error("localStorage fallback save failed:",err); }
}

let idbPromise=null;
function openStudyDB() {
  if(typeof indexedDB==="undefined") return Promise.reject(new Error("IndexedDB unavailable"));
  if(idbPromise) return idbPromise;
  idbPromise=new Promise((resolve,reject)=>{
    const req=indexedDB.open(IDB_NAME,1);
    req.onupgradeneeded=()=>{
      const db=req.result;
      if(!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
    };
    req.onsuccess=()=>resolve(req.result);
    req.onerror=()=>reject(req.error||new Error("IndexedDB open failed"));
    req.onblocked=()=>console.warn("IndexedDB open blocked by another old tab");
  });
  return idbPromise;
}
async function idbReadState() {
  try {
    const db=await openStudyDB();
    return await new Promise((resolve,reject)=>{
      const tx=db.transaction(IDB_STORE,"readonly");
      const req=tx.objectStore(IDB_STORE).get(IDB_KEY);
      req.onsuccess=()=>resolve(req.result||null);
      req.onerror=()=>reject(req.error);
    });
  } catch(err) {
    console.warn("IndexedDB read failed, fallback 사용:",err);
    return null;
  }
}
async function idbReadLegacyState() {
  if(typeof indexedDB==="undefined") return null;
  try {
    const db=await new Promise((resolve,reject)=>{
      const req=indexedDB.open(LEGACY_IDB_NAME,1);
      req.onsuccess=()=>resolve(req.result);
      req.onerror=()=>reject(req.error);
    });
    if(!db.objectStoreNames.contains(IDB_STORE)){ try{db.close();}catch{} return null; }
    const value=await new Promise((resolve,reject)=>{
      const tx=db.transaction(IDB_STORE,"readonly");
      const req=tx.objectStore(IDB_STORE).get(IDB_KEY);
      req.onsuccess=()=>resolve(req.result||null);
      req.onerror=()=>reject(req.error);
    });
    try{db.close();}catch{}
    return value;
  } catch(err) {
    console.warn("legacy IndexedDB read failed:",err);
    return null;
  }
}
async function persistLocalMerged(candidateRaw) {
  const candidate=ensureSyncMeta(candidateRaw,"local");
  try {
    const db=await openStudyDB();
    let merged=candidate;
    await new Promise((resolve,reject)=>{
      const tx=db.transaction(IDB_STORE,"readwrite");
      const store=tx.objectStore(IDB_STORE);
      const getReq=store.get(IDB_KEY);
      getReq.onsuccess=()=>{
        const existing=getReq.result;
        merged=existing ? mergeSyncData(existing,candidate) : candidate;
        store.put(merged,IDB_KEY);
      };
      getReq.onerror=()=>reject(getReq.error);
      tx.oncomplete=()=>resolve();
      tx.onerror=()=>reject(tx.error);
      tx.onabort=()=>reject(tx.error||new Error("IndexedDB transaction aborted"));
    });
    saveFallback(merged);
    return merged;
  } catch(err) {
    console.warn("IndexedDB write failed, localStorage fallback 사용:",err);
    saveFallback(candidate);
    return candidate;
  }
}
async function readDurableLocal() {
  // v3 저장소가 한 번이라도 만들어졌다면 그 이후에는 v2 저장소를 다시 섞지 않는다.
  // 배포 전부터 열려 있던 오래된 탭이 v2 저장소를 수정해도 v3 데이터를 오염시킬 수 없다.
  const currentFallbackRaw=loadCurrentFallback();
  const currentIdb=await idbReadState();
  if(currentIdb){
    const primary=ensureSyncMeta(currentIdb,"local");
    return currentFallbackRaw ? mergeSyncData(primary,ensureSyncMeta(currentFallbackRaw,"local")) : primary;
  }
  if(currentFallbackRaw) return ensureSyncMeta(currentFallbackRaw,"local");

  // 최초 1회만 legacy 저장소를 읽어 v3로 마이그레이션한다.
  const legacyIdb=await idbReadLegacyState();
  const legacyFallback=loadLegacyFallback();
  if(legacyIdb && legacyFallback) return mergeSyncData(ensureSyncMeta(legacyIdb,"legacy-idb"),ensureSyncMeta(legacyFallback,"legacy-ls"));
  if(legacyIdb) return ensureSyncMeta(legacyIdb,"legacy-idb");
  if(legacyFallback) return ensureSyncMeta(legacyFallback,"legacy-ls");
  return ensureSyncMeta(initialData,"local");
}

// ── 자동 스냅샷 백업: 복구용 보조 안전망. 정상 동기화가 이것에 의존하지는 않는다. ──
const SNAPSHOT_KEY = "studyos_snapshots";
function saveDailySnapshot(d) {
  try {
    const today = todayStr();
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    const snapshots = raw ? JSON.parse(raw) : {};
    const light = stripHeavyData(d);
    const currentSize = JSON.stringify(light).length;
    const existing = snapshots[today];
    if (!existing || currentSize >= (existing.size||0)) {
      snapshots[today] = { data: light, size: currentSize, savedAt: Date.now() };
    }
    const cutoff = Date.now() - 7*24*60*60*1000;
    Object.keys(snapshots).forEach(k=>{ if(snapshots[k].savedAt < cutoff) delete snapshots[k]; });
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshots));
  } catch(err) { console.warn("snapshot save failed:",err); }
}
function listSnapshots() {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

// ── Supabase 안전 동기화 ───────────────────────────────────────────────────────
const SUPABASE_URL = "https://xvvjvrgmgircgtpxcbzl.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh2dmp2cmdtZ2lyY2d0cHhjYnpsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQwMDU5OTcsImV4cCI6MjA5OTU4MTk5N30.mfArU3TkTBhXHov5MKhglLTJRMf3Rxc7TKeNqXD-sjI";
const SYNC_ROW_ID = "main_v3";
const LEGACY_SYNC_ROW_ID = "main";

async function cloudLoadRow(rowId) {
  try {
    const res=await fetch(`${SUPABASE_URL}/rest/v1/study_data?id=eq.${encodeURIComponent(rowId)}&select=data,updated_at`,{
      headers:{apikey:SUPABASE_KEY,Authorization:`Bearer ${SUPABASE_KEY}`,"Accept-Profile":"public"},
      cache:"no-store",
    });
    if(!res.ok){ console.error("cloudLoad failed:",rowId,res.status,await res.text()); return {ok:false,exists:false,data:null,updatedAt:null}; }
    const json=await res.json();
    const row=json?.[0];
    return {ok:true,exists:!!row,data:row?.data||null,updatedAt:row?.updated_at||null};
  } catch(err){ console.error("cloudLoad error:",rowId,err); return {ok:false,exists:false,data:null,updatedAt:null}; }
}
function cloudLoad(){ return cloudLoadRow(SYNC_ROW_ID); }
function cloudLoadLegacy(){ return cloudLoadRow(LEGACY_SYNC_ROW_ID); }

// 내가 읽은 updated_at과 서버의 현재 updated_at이 같은 경우에만 쓰기.
// 다른 탭/기기가 먼저 저장했으면 0행 수정 → conflict → 재조회/병합한다.
async function cloudSaveCAS(d, expectedUpdatedAt, exists=true) {
  try {
    const newUpdatedAt=new Date().toISOString();
    if(!exists){
      const res=await fetch(`${SUPABASE_URL}/rest/v1/study_data?select=updated_at`,{
        method:"POST",
        headers:{
          apikey:SUPABASE_KEY,Authorization:`Bearer ${SUPABASE_KEY}`,
          "Content-Type":"application/json","Content-Profile":"public",Prefer:"return=representation"
        },
        body:JSON.stringify({id:SYNC_ROW_ID,data:d,updated_at:newUpdatedAt}),
      });
      if(res.status===409) return {ok:false,conflict:true,updatedAt:null};
      if(!res.ok){ console.error("cloud create failed:",res.status,await res.text()); return {ok:false,conflict:false,updatedAt:null}; }
      const json=await res.json();
      return {ok:true,conflict:false,updatedAt:json?.[0]?.updated_at||newUpdatedAt};
    }

    if(!expectedUpdatedAt) return {ok:false,conflict:true,updatedAt:null};
    const filter=encodeURIComponent(expectedUpdatedAt);
    const res=await fetch(`${SUPABASE_URL}/rest/v1/study_data?id=eq.${SYNC_ROW_ID}&updated_at=eq.${filter}&select=updated_at`,{
      method:"PATCH",
      headers:{
        apikey:SUPABASE_KEY,Authorization:`Bearer ${SUPABASE_KEY}`,
        "Content-Type":"application/json","Content-Profile":"public",Prefer:"return=representation"
      },
      body:JSON.stringify({data:d,updated_at:newUpdatedAt}),
    });
    if(!res.ok){ console.error("cloud CAS save failed:",res.status,await res.text()); return {ok:false,conflict:false,updatedAt:null}; }
    const json=await res.json();
    if(!Array.isArray(json)||json.length===0) return {ok:false,conflict:true,updatedAt:null};
    return {ok:true,conflict:false,updatedAt:json[0].updated_at||newUpdatedAt};
  } catch(err){ console.error("cloudSaveCAS error:",err); return {ok:false,conflict:false,updatedAt:null}; }
}

function reconcileLocalAndCloud(localRaw, cloudRaw) {
  const localSchema=syncSchemaOf(localRaw), cloudSchema=syncSchemaOf(cloudRaw);
  const local=ensureSyncMeta(localRaw,"local"), cloud=cloudRaw?ensureSyncMeta(cloudRaw,"cloud"):null;
  if(!cloud || isEffectivelyEmpty(cloud)) return {...local,_sync:{...local._sync,migratedFromLegacy:false}};
  if(isEffectivelyEmpty(local)) return {...cloud,_sync:{...cloud._sync,migratedFromLegacy:false}};

  // 최초 v3 마이그레이션에서는 현재 기기의 데이터가 존재하면 예전 전체-snapshot cloud를 무작정 섞지 않는다.
  if(localSchema<SYNC_SCHEMA && cloudSchema<SYNC_SCHEMA) return {...local,_sync:{...local._sync,migratedFromLegacy:false}};
  if(localSchema===SYNC_SCHEMA && cloudSchema<SYNC_SCHEMA) return {...local,_sync:{...local._sync,migratedFromLegacy:false}};

  // 새 기기의 구버전 localStorage와 이미 정상 운영 중인 v3 cloud가 만난 경우:
  // 구버전 로컬이 실제로 더 나중에 저장된 증거가 있을 때만 병합한다.
  if(localSchema<SYNC_SCHEMA && cloudSchema===SYNC_SCHEMA){
    const legacyTime=Number(localRaw?._sync?.lastChangeAt)||Number(localRaw?._syncedAt)||0;
    const cloudTime=Number(cloud._sync.lastChangeAt)||0;
    if(legacyTime>cloudTime) return mergeSyncData(local,cloud);
    return {...cloud,_sync:{...cloud._sync,migratedFromLegacy:false}};
  }

  if(local._sync.migratedFromLegacy && cloudSchema===SYNC_SCHEMA){
    const legacyTime=Number(localRaw?._sync?.lastChangeAt)||Number(localRaw?._syncedAt)||0;
    const cloudTime=Number(cloud._sync.lastChangeAt)||0;
    if(legacyTime>cloudTime) return mergeSyncData(local,cloud);
    return {...cloud,_sync:{...cloud._sync,migratedFromLegacy:false}};
  }

  return mergeSyncData(local,cloud);
}

async function syncDurableWithCloud(startData) {
  let local=ensureSyncMeta(startData,"local");
  for(let attempt=0;attempt<8;attempt++){
    const remote=await cloudLoad();
    if(!remote.ok) return {ok:false,data:local,reason:"network"};

    // v3 전용 row가 아직 없는 최초 마이그레이션.
    // 이 기기에 실제 기록이 있으면 그 로컬을 기준으로 시작한다.
    // 이 기기가 완전히 비어 있을 때만 구버전 main row를 가져와 새 v3 row의 시드로 사용한다.
    if(!remote.exists && isEffectivelyEmpty(local)){
      const legacy=await cloudLoadLegacy();
      if(legacy.ok && legacy.exists && legacy.data && !isEffectivelyEmpty(legacy.data)){
        local=ensureSyncMeta(legacy.data,"legacy-cloud");
        local={...local,_sync:{...local._sync,migratedFromLegacy:false}};
        local=await persistLocalMerged(local);
      }
    }

    let merged=reconcileLocalAndCloud(local,remote.data);
    merged=await persistLocalMerged(merged);

    if(remote.exists && isSyncCurrent(remote.data) && sameSnapshot(ensureSyncMeta(remote.data,"cloud"),merged)){
      saveDailySnapshot(merged);
      return {ok:true,data:merged};
    }

    const saved=await cloudSaveCAS(merged,remote.updatedAt,remote.exists);
    if(saved.ok){
      saveDailySnapshot(merged);
      return {ok:true,data:merged};
    }
    if(saved.conflict){
      local=await readDurableLocal();
      continue;
    }
    return {ok:false,data:merged,reason:"save"};
  }
  return {ok:false,data:await readDurableLocal(),reason:"conflict-loop"};
}


function todayStr() { return new Date().toISOString().slice(0,10); }
// 학습일 기준 날짜: 새벽 6시 이전이면 "어제"로 취급 (하루 공부 흐름을 06:00~다음날 06:00로 봄)
function studyDayStr() {
  const now = new Date();
  const shifted = new Date(now);
  if (now.getHours() < START_HOUR) shifted.setDate(now.getDate()-1);
  return `${shifted.getFullYear()}-${String(shifted.getMonth()+1).padStart(2,"0")}-${String(shifted.getDate()).padStart(2,"0")}`;
}
function calcMinutes(daySlots) {
  return Object.keys(daySlots||{}).length * 10;
}
function calcSubjectMinutes(daySlots) {
  const r={};
  for(const [,sub] of Object.entries(daySlots||{})) r[sub]=(r[sub]||0)+10;
  return r;
}

// ── UI 헬퍼 ───────────────────────────────────────────────────────────────────
const inp = {
  background:"#111318", border:"1px solid #1e2230", borderRadius:8,
  color:"#e8eaf0", padding:"0.6rem 0.85rem", fontSize:"0.88rem",
   outline:"none", width:"100%", boxSizing:"border-box"
};

function Lbl({children}){return <div style={{color:"#4b5563",fontSize:"0.68rem",marginBottom:4,textTransform:"uppercase",letterSpacing:"0.06em"}}>{children}</div>;}

function Modal({title,onClose,children,wide}) {
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.88)",zIndex:999,display:"flex",alignItems:"center",justifyContent:"center",padding:"1rem"}}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:"#0a0c12",border:"1px solid #1e2230",borderRadius:18,padding:"1.8rem",
        maxWidth:wide?740:560,width:"100%",maxHeight:"92vh",overflowY:"auto",
        boxShadow:"0 32px 100px rgba(0,0,0,0.95)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"1.4rem"}}>
          <h3 style={{color:"#f1f3f9",margin:0,fontSize:"0.97rem",fontWeight:800}}>{title}</h3>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#4b5563",fontSize:"1.5rem",cursor:"pointer",lineHeight:1}}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Btn({children,onClick,color="#6366f1",full,small,outline,disabled}) {
  return (
    <button disabled={disabled} onClick={onClick} style={{
      padding:small?"0.32rem 0.75rem":"0.7rem 1.3rem", width:full?"100%":undefined,
      borderRadius:8, border:outline?`1px solid ${color}50`:"none",
      background:disabled?"#1e2230":outline?`${color}12`:color,
      color:disabled?"#4b5563":outline?color:"white",
       fontSize:small?"0.74rem":"0.87rem",
      fontWeight:700, cursor:disabled?"not-allowed":"pointer"
    }}>{children}</button>
  );
}

function Tag({code}) {
  const c=ERROR_CODES[code]; if(!c) return null;
  return <span style={{background:`${c.color}20`,color:c.color,border:`1px solid ${c.color}40`,
    borderRadius:99,padding:"0.13rem 0.5rem",fontSize:"0.7rem",
    fontFamily:"'JetBrains Mono',monospace",fontWeight:700}}>{code}</span>;
}





// ── 계획 시스템 ────────────────────────────────────────────────────────────────
// 계획 아이템: { id, date, subject, content, difficulty, focusTarget, status, note }
// status: "todo" | "done" | "failed"
const DIFFICULTY_LABEL = ["","매우쉬움","쉬움","보통","어려움","매우어려움"];
const DIFFICULTY_COLOR = ["","#22c55e","#84cc16","#f59e0b","#f97316","#ef4444"];

function nextDay(dateStr) {
  const d = new Date(dateStr); d.setDate(d.getDate()+1);
  return d.toISOString().slice(0,10);
}

// 계획의 "원본" id를 찾는다 — rootId가 있으면 그대로, 없는 예전 데이터는
// 이월 id 패턴("원본id_m_날짜_m_날짜...")을 전부 벗겨내서 최초 id로 역추적.
// 이월이 몇 번을 거치든(체인이 아무리 길어도) 같은 계획으로 묶여서 중복 집계를 막는다.
function resolvePlanRoot(p){
  if(p.rootId) return p.rootId;
  let base = String(p.id);
  let m;
  while((m = base.match(/^(.+)_m_\d{4}-\d{2}-\d{2}$/))) base = m[1];
  return base;
}

function PlanForm({onSave, onClose, editData, defaultDate}) {
  const [date,setDate]=useState(editData?.date||defaultDate||todayStr());
  const [subject,setSubject]=useState(editData?.subject||"수학");
  const [content,setContent]=useState(editData?.content||"");

  return (
    <Modal title={editData?"계획 수정":"계획 추가"} onClose={onClose}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:"0.9rem"}}>
        <div>
          <Lbl>날짜</Lbl>
          <input type="date" value={date} onChange={e=>setDate(e.target.value)} style={inp}/>
        </div>
        <div>
          <Lbl>과목</Lbl>
          <select value={subject} onChange={e=>setSubject(e.target.value)} style={inp}>
            {SUBJECTS.map(s=><option key={s}>{s}</option>)}
            <option value="기타">기타</option>
          </select>
        </div>
      </div>
      <div style={{marginBottom:"1.2rem"}}>
        <Lbl>할 내용</Lbl>
        <textarea value={content} onChange={e=>setContent(e.target.value)} rows={3}
          style={{...inp,resize:"vertical"}} placeholder="예: 수학의 정석 미적분 p.120~150 풀기"/>
      </div>
      <Btn full onClick={()=>{
        if(!content.trim())return;
        const id=editData?.id||Date.now();
        // 수정 시 기존 필드(진행상태, 누적시간, 세션기록, 실패사유 등)를 그대로 유지하고
        // 날짜/과목/내용만 덮어씀 — 수정할 때마다 시간이 초기화되던 버그 수정
        onSave({...(editData||{}), id,date,subject,content,rootId:editData?.rootId||id,status:editData?.status||"todo"});
        onClose();
      }}>저장</Btn>
    </Modal>
  );
}

// ── 계획 정리/사유 태깅 ──────────────────────────────────────────────────────────
function ReasonPickerModal({title, reasons, onSelect, onClose, help}) {
  return (
    <Modal title={title} onClose={onClose}>
      {help&&<div style={{color:"#6b7280",fontSize:"0.76rem",lineHeight:1.55,marginBottom:10}}>{help}</div>}
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {Object.entries(reasons).map(([code,r])=>(
          <button key={code} onClick={()=>onSelect(code)} style={{
            display:"flex",flexDirection:"column",alignItems:"flex-start",gap:2,
            padding:"0.7rem 0.9rem",borderRadius:9,cursor:"pointer",textAlign:"left",
            border:`1px solid ${r.color}40`,background:`${r.color}12`
          }}>
            <span style={{color:r.color,fontWeight:700,fontSize:"0.85rem"}}>{r.label}</span>
            <span style={{color:"#6b7280",fontSize:"0.72rem"}}>{r.desc}</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}

function BatchPlanReviewModal({date, plans, onApply, onClose}) {
  const eligible=plans.filter(p=>p.status!=="done"&&p.status!=="deletedLog");
  const defaultIdsFor=mode=>eligible.filter(p=>mode==="failed"?(p.status==="todo"||!p.failReason):p.status==="todo").map(p=>String(p.id));
  const [mode,setMode]=useState("failed");
  const [selected,setSelected]=useState(()=>new Set(defaultIdsFor("failed")));
  const [reason,setReason]=useState("");
  const reasons=mode==="failed"?FAIL_REASONS:DELETE_REASONS;

  function changeMode(next){
    setMode(next);
    setReason("");
    setSelected(new Set(defaultIdsFor(next)));
  }
  function toggle(id){
    const k=String(id);
    setSelected(prev=>{
      const n=new Set(prev);
      if(n.has(k))n.delete(k);else n.add(k);
      return n;
    });
  }
  const selectedCount=selected.size;
  const allSelected=eligible.length>0&&selectedCount===eligible.length;

  return (
    <Modal title={`🧹 ${date} 계획 일괄 정리`} onClose={onClose} wide>
      <div style={{color:"#9ca3af",fontSize:"0.77rem",lineHeight:1.6,marginBottom:10}}>
        하루의 실패 원인이 같다면 <b style={{color:"#d1d5db"}}>계획들을 한 번에 선택하고 사유는 한 번만</b> 누르면 돼.
      </div>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:6,marginBottom:12}}>
        <button onClick={()=>changeMode("failed")} style={{padding:"0.55rem",borderRadius:8,cursor:"pointer",fontWeight:800,fontSize:"0.78rem",border:`1px solid ${mode==="failed"?"#ef444460":"#1e2230"}`,background:mode==="failed"?"#ef444418":"#0a0c12",color:mode==="failed"?"#ef4444":"#6b7280"}}>❌ 실패 → 내일로</button>
        <button onClick={()=>changeMode("deleted")} style={{padding:"0.55rem",borderRadius:8,cursor:"pointer",fontWeight:800,fontSize:"0.78rem",border:`1px solid ${mode==="deleted"?"#f59e0b60":"#1e2230"}`,background:mode==="deleted"?"#f59e0b18":"#0a0c12",color:mode==="deleted"?"#f59e0b":"#6b7280"}}>🗑 계획 삭제</button>
      </div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
        <span style={{color:"#6b7280",fontSize:"0.7rem"}}>대상 계획 {selectedCount}/{eligible.length}</span>
        <button onClick={()=>setSelected(allSelected?new Set():new Set(eligible.map(p=>String(p.id))))} style={{background:"none",border:"none",color:"#818cf8",fontSize:"0.7rem",cursor:"pointer"}}>{allSelected?"전체 해제":"전체 선택"}</button>
      </div>
      <div style={{maxHeight:240,overflowY:"auto",display:"flex",flexDirection:"column",gap:5,marginBottom:12}}>
        {eligible.length===0&&<div style={{color:"#4b5563",fontSize:"0.8rem",padding:"1rem",textAlign:"center"}}>정리할 미완료 계획이 없어.</div>}
        {eligible.map(p=>{
          const checked=selected.has(String(p.id));
          const c=SUBJECT_COLORS[p.subject];
          const oldReason=p.failReason?FAIL_REASONS[p.failReason]:null;
          return <button key={p.id} onClick={()=>toggle(p.id)} style={{display:"flex",alignItems:"center",gap:8,textAlign:"left",padding:"0.55rem 0.65rem",borderRadius:8,cursor:"pointer",background:checked?"#6366f112":"#0a0c12",border:`1px solid ${checked?"#6366f140":"#1e2230"}`}}>
            <span style={{width:17,height:17,borderRadius:4,border:`1px solid ${checked?"#6366f1":"#374151"}`,background:checked?"#6366f1":"transparent",color:"white",fontSize:"0.68rem",display:"inline-flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>{checked?"✓":""}</span>
            <span style={{color:c?.text||"#a5b4fc",fontSize:"0.72rem",fontWeight:800,flexShrink:0}}>{p.subject}</span>
            <span style={{color:"#d1d5db",fontSize:"0.76rem",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",flex:1}}>{p.content}</span>
            {p.status==="failed"&&<span style={{color:oldReason?.color||"#ef4444",fontSize:"0.62rem",flexShrink:0}}>{oldReason?.label||"사유 미분류"}</span>}
          </button>;
        })}
      </div>
      <div style={{color:"#6b7280",fontSize:"0.7rem",marginBottom:6}}>공통 사유 — 한 번만 선택</div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(2,minmax(0,1fr))",gap:6,marginBottom:12}}>
        {Object.entries(reasons).map(([code,r])=>(
          <button key={code} onClick={()=>setReason(code)} style={{padding:"0.55rem 0.6rem",borderRadius:8,cursor:"pointer",textAlign:"left",border:`1px solid ${reason===code?r.color+"80":"#1e2230"}`,background:reason===code?r.color+"18":"#0a0c12"}}>
            <div style={{color:reason===code?r.color:"#9ca3af",fontSize:"0.73rem",fontWeight:800}}>{r.label}</div>
            <div style={{color:"#4b5563",fontSize:"0.61rem",marginTop:1}}>{r.desc}</div>
          </button>
        ))}
      </div>
      <Btn full disabled={!reason||selectedCount===0} color={mode==="failed"?"#ef4444":"#f59e0b"} onClick={()=>{onApply([...selected],mode,reason);onClose();}}>{mode==="failed"?`선택 ${selectedCount}개 실패 처리 + 이월`:`선택 ${selectedCount}개 삭제`}</Btn>
    </Modal>
  );
}

// 계획의 공부 시간 세션들을 직접 보고 수정/삭제/추가하는 모달
// 세션 시각을 바꾸면 총 시간(totalMinutes)과 타임테이블 슬롯 색칠까지 전부 다시 계산해서 맞춰줌
function timeToMinutesOfDay(hhmm){ const [h,m]=hhmm.split(":").map(Number); return h*60+m; }
function minutesOfDayToTime(mins){ const h=Math.floor(mins/60)%24, m=mins%60; return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`; }

function SessionEditModal({plan, onSave, onClose}) {
  const [sessions,setSessions]=useState(()=>
    (plan.sessions||[]).map(s=>{
      const start=new Date(s.startedAt);
      const end=new Date(s.endedAt||s.startedAt+s.minutes*60000);
      return {
        date: s.date || start.toISOString().slice(0,10),
        startTime: `${String(start.getHours()).padStart(2,"0")}:${String(start.getMinutes()).padStart(2,"0")}`,
        endTime: `${String(end.getHours()).padStart(2,"0")}:${String(end.getMinutes()).padStart(2,"0")}`,
      };
    })
  );

  function updateSession(i, field, value){
    setSessions(list=>list.map((s,idx)=>idx===i?{...s,[field]:value}:s));
  }
  function deleteSession(i){
    setSessions(list=>list.filter((_,idx)=>idx!==i));
  }
  function addSession(){
    setSessions(list=>[...list, {date:plan.date, startTime:"09:00", endTime:"10:00"}]);
  }

  function sessionMinutes(s){
    let start=timeToMinutesOfDay(s.startTime), end=timeToMinutesOfDay(s.endTime);
    if(end<=start) end+=1440; // 자정 넘긴 세션(예: 23:30~00:20)
    return end-start;
  }

  const totalMin = sessions.reduce((a,s)=>a+sessionMinutes(s),0);

  function handleSave(){
    // 세션 텍스트 → 실제 startedAt/endedAt(ms)로 변환
    const rebuilt = sessions.map(s=>{
      const [sh,sm]=s.startTime.split(":").map(Number);
      const startedAt = new Date(`${s.date}T00:00:00`).getTime() + (sh*60+sm)*60000;
      const minutes = sessionMinutes(s);
      const endedAt = startedAt + minutes*60000;
      return { date:s.date, startedAt, endedAt, minutes };
    });
    onSave(rebuilt);
    onClose();
  }

  return (
    <Modal title="⏱ 공부 시간 기록 수정" onClose={onClose} wide>
      <p style={{color:"#6b7280",fontSize:"0.78rem",marginBottom:"1rem",lineHeight:1.6}}>
        몇 시부터 몇 시까지 했는지 직접 고칠 수 있어. 수정하면 타임테이블 색칠도 같이 반영돼.
      </p>
      <div style={{display:"flex",flexDirection:"column",gap:8,marginBottom:"1rem"}}>
        {sessions.length===0&&<div style={{color:"#2d3241",fontSize:"0.82rem",textAlign:"center",padding:"1rem 0"}}>기록된 세션이 없어</div>}
        {sessions.map((s,i)=>(
          <div key={i} style={{background:"#111318",border:"1px solid #1e2230",borderRadius:9,padding:"0.6rem 0.7rem",display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
            <input type="date" value={s.date} onChange={e=>updateSession(i,"date",e.target.value)} style={{...inp,width:"auto",flex:"1 1 130px",padding:"0.4rem 0.5rem",fontSize:"0.78rem"}}/>
            <input type="time" value={s.startTime} onChange={e=>updateSession(i,"startTime",e.target.value)} style={{...inp,width:"auto",flex:"1 1 90px",padding:"0.4rem 0.5rem",fontSize:"0.78rem"}}/>
            <span style={{color:"#4b5563",fontSize:"0.78rem"}}>~</span>
            <input type="time" value={s.endTime} onChange={e=>updateSession(i,"endTime",e.target.value)} style={{...inp,width:"auto",flex:"1 1 90px",padding:"0.4rem 0.5rem",fontSize:"0.78rem"}}/>
            <span style={{color:"#f59e0b",fontSize:"0.76rem",fontWeight:700,minWidth:60,textAlign:"right"}}>{Math.floor(sessionMinutes(s)/60)}h {sessionMinutes(s)%60}m</span>
            <button onClick={()=>deleteSession(i)} style={{background:"none",border:"none",color:"#2d3241",cursor:"pointer",fontSize:"0.85rem"}}>×</button>
          </div>
        ))}
      </div>
      <Btn small outline color="#6366f1" onClick={addSession}>+ 세션 직접 추가</Btn>
      <div style={{marginTop:"1rem",paddingTop:"0.9rem",borderTop:"1px solid #1e2230",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <span style={{color:"#9ca3af",fontSize:"0.8rem"}}>합계</span>
        <span style={{color:"#f59e0b",fontSize:"0.95rem",fontWeight:800}}>{Math.floor(totalMin/60)}h {totalMin%60}m</span>
      </div>
      <div style={{marginTop:"1rem"}}>
        <Btn full onClick={handleSave}>저장</Btn>
      </div>
    </Modal>
  );
}

function PlanCard({plan,onStatus,onEdit,onDelete,activeTimer,onStartTimer,onStopTimer,onEditSessions}) {
  const [deleteModalOpen,setDeleteModalOpen]=useState(false);
  const [sessionModalOpen,setSessionModalOpen]=useState(false);
  const c=SUBJECT_COLORS[plan.subject];
  const statusStyle={todo:{bg:"#1e2230",color:"#6b7280",label:"예정"},done:{bg:"#22c55e20",color:"#22c55e",label:"✅ 완료"},failed:{bg:"#ef444420",color:"#ef4444",label:"❌ 실패"}}[plan.status]||{bg:"#1e2230",color:"#6b7280",label:"예정"};
  const isRunning=activeTimer&&activeTimer.planId===plan.id;
  const failReason=plan.failReason?FAIL_REASONS[plan.failReason]:null;
  return (
    <div style={{background:"#0a0c12",border:`1px solid ${isRunning?(c?.bg||"#6366f1"):plan.status==="done"?"#22c55e30":plan.status==="failed"?"#ef444430":"#1e2230"}`,borderRadius:11,padding:"0.85rem 1rem",marginBottom:6,opacity:plan.status==="done"?0.7:1}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
        <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
          <span style={{color:c?.text||"#a5b4fc",fontWeight:800,fontSize:"0.82rem"}}>{plan.subject}</span>
          <span style={{background:statusStyle.bg,color:statusStyle.color,fontSize:"0.7rem",padding:"0.12rem 0.5rem",borderRadius:99,fontWeight:700}}>{statusStyle.label}</span>
          {failReason&&<span style={{background:`${failReason.color}20`,color:failReason.color,fontSize:"0.66rem",padding:"0.1rem 0.45rem",borderRadius:99,fontWeight:700}}>{failReason.label}</span>}
          {plan.status==="failed"&&!failReason&&<span style={{background:"#6b728020",color:"#9ca3af",fontSize:"0.64rem",padding:"0.1rem 0.45rem",borderRadius:99,fontWeight:700}}>사유 미분류</span>}
          <button onClick={()=>setSessionModalOpen(true)} style={{background:plan.totalMinutes>0?"#f59e0b18":"transparent",border:`1px solid ${plan.totalMinutes>0?"#f59e0b40":"#2a2d3a"}`,borderRadius:99,padding:"0.1rem 0.5rem",cursor:"pointer",color:plan.totalMinutes>0?"#f59e0b":"#4b5563",fontSize:"0.68rem",fontFamily:"'JetBrains Mono',monospace",fontWeight:700}}>⏱ {plan.totalMinutes>0?`${Math.floor(plan.totalMinutes/60)>0?`${Math.floor(plan.totalMinutes/60)}h `:""}${plan.totalMinutes%60}m`:"시간 기록"}</button>
        </div>
        <div style={{display:"flex",gap:5,flexShrink:0}}>
          <button onClick={()=>onEdit(plan)} style={{background:"none",border:"none",color:"#4b5563",cursor:"pointer",fontSize:"0.7rem"}}>수정</button>
          <button onClick={()=>setDeleteModalOpen(true)} style={{background:"none",border:"none",color:"#2d3241",cursor:"pointer",fontSize:"0.82rem"}}>×</button>
        </div>
      </div>
      <div style={{color:plan.status==="done"?"#4b5563":"#d1d5db",fontSize:"0.82rem",lineHeight:1.6,marginBottom:plan.note?6:8,textDecoration:plan.status==="done"?"line-through":"none"}}>{plan.content}</div>
      {plan.note&&<div style={{color:"#4b5563",fontSize:"0.72rem",marginBottom:8}}>📌 {plan.note}</div>}
      {plan.status==="todo"&&onStartTimer&&<div style={{marginBottom:6}}>{isRunning?<button onClick={onStopTimer} style={{width:"100%",padding:"0.4rem",borderRadius:7,border:"1px solid #ef444440",background:"#ef444418",color:"#ef4444",fontSize:"0.76rem",fontWeight:700,cursor:"pointer"}}>■ 타이머 정지</button>:<button onClick={()=>onStartTimer(plan)} disabled={!!activeTimer} style={{width:"100%",padding:"0.4rem",borderRadius:7,border:`1px solid ${activeTimer?"#2a2d3a":(c?.bg||"#6366f1")+"50"}`,background:activeTimer?"transparent":(c?.bg||"#6366f1")+"18",color:activeTimer?"#4b5563":(c?.text||"#a5b4fc"),fontSize:"0.76rem",fontWeight:700,cursor:activeTimer?"not-allowed":"pointer"}}>{activeTimer?"다른 타이머 실행 중":"▶ 타이머 시작"}</button>}</div>}
      {plan.status==="todo"&&<div style={{display:"flex",gap:6}}><button onClick={()=>onStatus(plan.id,"done")} style={{flex:1,padding:"0.35rem",borderRadius:7,border:"1px solid #22c55e40",background:"#22c55e15",color:"#22c55e",fontSize:"0.75rem",fontWeight:700,cursor:"pointer"}}>✅ 완료</button><button onClick={()=>onStatus(plan.id,"failed")} style={{flex:1,padding:"0.35rem",borderRadius:7,border:"1px solid #ef444440",background:"#ef444415",color:"#ef4444",fontSize:"0.75rem",fontWeight:700,cursor:"pointer"}}>❌ 실패 → 내일로</button></div>}
      {plan.status==="failed"&&<div style={{color:"#ef4444",fontSize:"0.7rem"}}>→ {nextDay(plan.date)}로 이동됨</div>}
      {deleteModalOpen&&<ReasonPickerModal title="🗑 이 계획을 왜 삭제해?" reasons={DELETE_REASONS} help="삭제 이유는 리포트용으로 남고, 계획 자체는 화면에서 사라져. 여러 계획은 '일괄 정리'에서 한 번에 처리할 수 있어." onSelect={code=>{onDelete(plan.id,code);setDeleteModalOpen(false);}} onClose={()=>setDeleteModalOpen(false)}/>} 
      {sessionModalOpen&&<SessionEditModal plan={plan} onSave={sessions=>{onEditSessions(plan.id,sessions);setSessionModalOpen(false);}} onClose={()=>setSessionModalOpen(false)}/>} 
    </div>
  );
}

// ── 주간/월간 상세 목표 (여러 항목, 과목별, 난이도, 완료여부) ──────────────────────
function GoalForm({onSave, onClose, editData, scope, scopeKey}) {
  const [subject,setSubject]=useState(editData?.subject||"수학");
  const [content,setContent]=useState(editData?.content||"");
  const [difficulty,setDifficulty]=useState(editData?.difficulty||3);
  const [note,setNote]=useState(editData?.note||"");
  const scopeLabel = scope==="week" ? "주간" : "월간";
  return (
    <Modal title={editData ? `${scopeLabel} 목표 수정` : `${scopeLabel} 목표 추가`} onClose={onClose}>
      <div style={{marginBottom:"0.9rem"}}>
        <Lbl>과목</Lbl>
        <select value={subject} onChange={e=>setSubject(e.target.value)} style={inp}>
          {SUBJECTS.map(s=><option key={s}>{s}</option>)}
          <option value="기타">기타</option>
          <option value="전체">전체 (과목 무관)</option>
        </select>
      </div>
      <div style={{marginBottom:"0.9rem"}}>
        <Lbl>{scopeLabel} 목표 내용</Lbl>
        <textarea value={content} onChange={e=>setContent(e.target.value)} rows={3}
          style={{...inp,resize:"vertical"}} placeholder={scope==="week" ? "예: 수학 오답노트 XC 유형 전부 재풀이" : "예: 국어 문학 개념 단권화 완성"}/>
      </div>
      <div style={{marginBottom:"0.9rem"}}>
        <Lbl>난이도 — <span style={{color:DIFFICULTY_COLOR[difficulty]}}>{DIFFICULTY_LABEL[difficulty]}</span></Lbl>
        <input type="range" min={1} max={5} value={difficulty} onChange={e=>setDifficulty(Number(e.target.value))}
          style={{width:"100%",accentColor:DIFFICULTY_COLOR[difficulty]}}/>
      </div>
      <div style={{marginBottom:"1.2rem"}}>
        <Lbl>메모 (선택)</Lbl>
        <input value={note} onChange={e=>setNote(e.target.value)} style={inp} placeholder="세부 기준, 참고사항 등"/>
      </div>
      <Btn full onClick={()=>{
        if(!content.trim())return;
        onSave({id:editData?.id||Date.now(),scope,scopeKey,subject,content,difficulty,note,status:"todo"});
        onClose();
      }}>저장</Btn>
      {editData&&(
        <div style={{color:"#4b5563",fontSize:"0.68rem",marginTop:8,textAlign:"center"}}>이 목표는 삭제하려면 목록에서 × 버튼을 눌러줘</div>
      )}
    </Modal>
  );
}

function GoalCard({goal,onStatus,onEdit,onDelete}) {
  const c=SUBJECT_COLORS[goal.subject] || {bg:"#6366f1",text:"#a5b4fc"};
  const statusStyle = {
    todo:{bg:"#1e2230",color:"#6b7280",label:"진행중"},
    done:{bg:"#22c55e20",color:"#22c55e",label:"✅ 달성"},
  }[goal.status]||{bg:"#1e2230",color:"#6b7280",label:"진행중"};
  return (
    <div style={{background:"#0a0c12",border:`1px solid ${goal.status==="done"?"#22c55e30":"#1e2230"}`,
      borderRadius:11,padding:"0.8rem 1rem",marginBottom:6,opacity:goal.status==="done"?0.75:1}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
        <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
          <span style={{color:c?.text,fontWeight:800,fontSize:"0.8rem"}}>{goal.subject}</span>
          <span style={{background:statusStyle.bg,color:statusStyle.color,fontSize:"0.68rem",padding:"0.1rem 0.45rem",borderRadius:99,fontWeight:700}}>{statusStyle.label}</span>
          {goal.difficulty&&<span style={{color:DIFFICULTY_COLOR[goal.difficulty],fontSize:"0.66rem"}}>난이도 {DIFFICULTY_LABEL[goal.difficulty]}</span>}
        </div>
        <div style={{display:"flex",gap:5,flexShrink:0}}>
          <button onClick={()=>onEdit(goal)} style={{background:"none",border:"none",color:"#4b5563",cursor:"pointer",fontSize:"0.68rem"}}>수정</button>
          <button onClick={()=>onDelete(goal.id)} style={{background:"none",border:"none",color:"#2d3241",cursor:"pointer",fontSize:"0.8rem"}}>×</button>
        </div>
      </div>
      <div style={{color:goal.status==="done"?"#4b5563":"#d1d5db",fontSize:"0.8rem",lineHeight:1.6,marginBottom:goal.note?5:6,textDecoration:goal.status==="done"?"line-through":"none"}}>{goal.content}</div>
      {goal.note&&<div style={{color:"#4b5563",fontSize:"0.7rem",marginBottom:6}}>📌 {goal.note}</div>}
      {goal.status==="todo"&&(
        <button onClick={()=>onStatus(goal.id,"done")} style={{width:"100%",padding:"0.32rem",borderRadius:7,border:"1px solid #22c55e40",background:"#22c55e15",color:"#22c55e",fontSize:"0.72rem",fontWeight:700,cursor:"pointer"}}>✅ 달성 완료</button>
      )}
      {goal.status==="done"&&(
        <button onClick={()=>onStatus(goal.id,"todo")} style={{width:"100%",padding:"0.32rem",borderRadius:7,border:"1px solid #2a2d3a",background:"transparent",color:"#4b5563",fontSize:"0.72rem",cursor:"pointer"}}>되돌리기</button>
      )}
    </div>
  );
}


// ── 오답 등록 ──────────────────────────────────────────────────────────────────
// ── 인앱 카메라 (무음 촬영) ──────────────────────────────────────────────────────
// 네이티브 카메라 앱을 거치지 않고 브라우저 안에서 직접 영상 스트림을 받아 캡처하므로
// 기기의 카메라 셔터음이 울리지 않는다 (조용한 공간에서 오답 사진 찍을 때 유용).
function InAppCamera({ onCapture, onClose }) {
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const [ready,setReady]=useState(false);
  const [error,setError]=useState("");
  const [facing,setFacing]=useState("environment"); // environment=후면, user=전면

  useEffect(()=>{
    let cancelled=false;
    async function startStream(){
      setReady(false); setError("");
      // 기존 스트림 정리
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t=>t.stop());
        streamRef.current = null;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: facing }, width: { ideal: 1280 }, height: { ideal: 1280 } },
          audio: false
        });
        if (cancelled) { stream.getTracks().forEach(t=>t.stop()); return; }
        streamRef.current = stream;
        if (videoRef.current) {
          videoRef.current.srcObject = stream;
          await videoRef.current.play();
        }
        setReady(true);
      } catch (err) {
        setError("카메라를 열 수 없어. 브라우저 카메라 권한을 허용해줘.");
      }
    }
    startStream();
    return ()=>{
      cancelled=true;
      if (streamRef.current) streamRef.current.getTracks().forEach(t=>t.stop());
    };
  },[facing]);

  function capture(){
    const video=videoRef.current;
    if (!video || !ready) return;
    const canvas=document.createElement("canvas");
    canvas.width=video.videoWidth;
    canvas.height=video.videoHeight;
    const ctx=canvas.getContext("2d");
    ctx.drawImage(video,0,0);
    // 압축(가로 1000px, jpeg 75%)해서 용량 문제 방지
    const MAX_W=1000;
    const scale=Math.min(1, MAX_W/canvas.width);
    let finalCanvas=canvas;
    if (scale<1) {
      finalCanvas=document.createElement("canvas");
      finalCanvas.width=Math.round(canvas.width*scale);
      finalCanvas.height=Math.round(canvas.height*scale);
      finalCanvas.getContext("2d").drawImage(canvas,0,0,finalCanvas.width,finalCanvas.height);
    }
    const dataUrl=finalCanvas.toDataURL("image/jpeg",0.8);
    onCapture(dataUrl);
    if (streamRef.current) streamRef.current.getTracks().forEach(t=>t.stop());
    onClose();
  }

  function close(){
    if (streamRef.current) streamRef.current.getTracks().forEach(t=>t.stop());
    onClose();
  }

  return (
    <div style={{position:"fixed",inset:0,background:"#000",zIndex:999,display:"flex",flexDirection:"column"}}>
      <div style={{position:"relative",flex:1,overflow:"hidden",display:"flex",alignItems:"center",justifyContent:"center"}}>
        <video ref={videoRef} playsInline muted style={{width:"100%",height:"100%",objectFit:"contain",background:"#000"}}/>
        {!ready && !error && (
          <div style={{position:"absolute",color:"#9ca3af",fontSize:"0.85rem"}}>카메라 여는 중...</div>
        )}
        {error && (
          <div style={{position:"absolute",color:"#ef4444",fontSize:"0.85rem",textAlign:"center",padding:"0 2rem"}}>{error}</div>
        )}
      </div>
      <div style={{background:"#0a0c12",padding:"1rem 1.2rem",display:"flex",alignItems:"center",justifyContent:"space-between"}}>
        <button onClick={close} style={{background:"none",border:"none",color:"#9ca3af",cursor:"pointer",fontSize:"0.85rem",padding:"0.5rem"}}>취소</button>
        <button onClick={capture} disabled={!ready} style={{
          width:66,height:66,borderRadius:"50%",background:ready?"white":"#4b5563",
          border:"4px solid #6366f1",cursor:ready?"pointer":"default"
        }}/>
        <button onClick={()=>setFacing(f=>f==="environment"?"user":"environment")} style={{background:"none",border:"none",color:"#9ca3af",cursor:"pointer",fontSize:"0.78rem",padding:"0.5rem"}}>🔄 전환</button>
      </div>
    </div>
  );
}

function WrongForm({onSave,onClose,editData,onDelete}) {
  const [date,setDate]=useState(editData?.date||studyDayStr());
  const [subject,setSubject]=useState(editData?.subject||"수학");
  const [code,setCode]=useState(editData?.code||"XC");
  const [problem,setProblem]=useState(editData?.problem||"");
  const [cause,setCause]=useState(editData?.cause||"");
  const [fix,setFix]=useState(editData?.fix||"");
  const [photo,setPhoto]=useState(editData?.photo||null);
  const [answerText,setAnswerText]=useState(editData?.answerText||"");
  const [cameraOpen,setCameraOpen]=useState(false);

  function handlePhoto(e, setter) {
    const file=e.target.files[0]; if(!file)return;
    if(!file.type.startsWith("image/")){alert("이미지 파일만 가능해");return;}
    const reader=new FileReader();
    reader.onload=ev=>{
      // 큰 사진은 자동으로 축소+압축해서 localStorage 용량 문제를 방지
      const img=new Image();
      img.onload=()=>{
        const MAX_W=1000;
        const scale=Math.min(1, MAX_W/img.width);
        const w=Math.round(img.width*scale), h=Math.round(img.height*scale);
        const canvas=document.createElement("canvas");
        canvas.width=w; canvas.height=h;
        const ctx=canvas.getContext("2d");
        ctx.drawImage(img,0,0,w,h);
        const compressed=canvas.toDataURL("image/jpeg",0.75);
        setter(compressed);
      };
      img.onerror=()=>{ alert("사진을 불러오지 못했어. 다른 사진으로 시도해줘."); };
      img.src=ev.target.result;
    };
    reader.onerror=()=>{ alert("파일을 읽는 중 오류가 발생했어."); };
    reader.readAsDataURL(file);
  }

  return (
    <Modal title={editData?"오답 수정":"오답 등록"} onClose={onClose}>
      {/* 날짜 + 과목 */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:"0.9rem"}}>
        <div>
          <Lbl>날짜</Lbl>
          <input type="date" value={date} onChange={e=>setDate(e.target.value)} style={inp}/>
        </div>
        <div>
          <Lbl>과목</Lbl>
          <select value={subject} onChange={e=>setSubject(e.target.value)} style={inp}>
            {SUBJECTS.map(s=><option key={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {/* 오답 코드 — 대분류별로 묶어서 버튼 선택 */}
      <div style={{marginBottom:"0.9rem"}}>
        <Lbl>오답 코드</Lbl>
        <div style={{display:"flex",flexDirection:"column",gap:8}}>
          {["XC","XM","XJ"].map(major=>{
            const ml=ERROR_MAJOR_LABEL[major];
            const codesInGroup=Object.entries(ERROR_CODES).filter(([k])=>ERROR_MAJOR[k]===major);
            return (
              <div key={major} style={{border:`1px solid ${ml.color}25`,borderRadius:9,padding:"0.5rem 0.6rem",background:`${ml.color}08`}}>
                <div style={{color:ml.color,fontSize:"0.68rem",fontWeight:800,fontFamily:"'JetBrains Mono',monospace",marginBottom:5}}>{ml.label}</div>
                <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                  {codesInGroup.map(([k,v])=>(
                    <button key={k} onClick={()=>setCode(k)} style={{
                      padding:"0.3rem 0.65rem",borderRadius:8,cursor:"pointer",
                      border:`1px solid ${code===k?v.color:v.color+"40"}`,
                      background:code===k?v.color+"25":"transparent",
                      color:code===k?v.color:v.color+"99",
                      fontFamily:"'JetBrains Mono',monospace",fontSize:"0.72rem",fontWeight:700
                    }}>{k}</button>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
        <div style={{color:ERROR_CODES[code]?.color||"#9ca3af",fontSize:"0.72rem",marginTop:6}}>
          <strong>{ERROR_CODES[code]?.desc||code}</strong>{ERROR_CODES[code]?.detail?` — ${ERROR_CODES[code].detail}`:""}
        </div>
      </div>

      <div style={{marginBottom:"0.9rem"}}>
        <Lbl>문제 번호/요약 (선택)</Lbl>
        <input value={problem} onChange={e=>setProblem(e.target.value)} style={inp} placeholder="예: 3번, 함수 합성"/>
      </div>

      {/* 사진 */}
      <div style={{marginBottom:"0.9rem"}}>
        <Lbl>문제 사진 (선택)</Lbl>
        <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>
          <label style={{
            display:"inline-flex",alignItems:"center",gap:6,
            background:"#111318",border:"1px solid #1e2230",borderRadius:8,
            padding:"0.55rem 1rem",cursor:"pointer",
            color:"#9ca3af",fontSize:"0.8rem",fontWeight:600
          }}>
            🖼️ 앨범에서 선택
            <input type="file" accept="image/*" onChange={e=>handlePhoto(e,setPhoto)} style={{display:"none"}}/>
          </label>
          <button onClick={()=>setCameraOpen(true)} style={{
            display:"inline-flex",alignItems:"center",gap:6,
            background:"#6366f118",border:"1px solid #6366f140",borderRadius:8,
            padding:"0.55rem 1rem",cursor:"pointer",
            color:"#818cf8",fontSize:"0.8rem",fontWeight:600
          }}>🔇 무음 카메라</button>
        </div>
        {photo&&<div style={{marginTop:6,display:"flex",alignItems:"center",gap:8}}>
          <img src={photo} alt="미리보기" style={{height:60,borderRadius:6,border:"1px solid #1e2230",objectFit:"contain"}}/>
          <button onClick={()=>setPhoto(null)} style={{background:"none",border:"none",color:"#ef4444",cursor:"pointer",fontSize:"0.75rem"}}>삭제</button>
        </div>}
      </div>

      {cameraOpen&&(
        <InAppCamera onCapture={dataUrl=>setPhoto(dataUrl)} onClose={()=>setCameraOpen(false)}/>
      )}

      {/* 정답 */}
      <div style={{marginBottom:"0.9rem"}}>
        <Lbl>정답 (선택 · 문제풀이 모드에서 '답 보기'로 확인)</Lbl>
        <input value={answerText} onChange={e=>setAnswerText(e.target.value)} style={inp} placeholder="예: ③, x=3, '민중은 우매하다'는 인식 등"/>
      </div>

      <div style={{marginBottom:"0.9rem"}}>
        <Lbl>왜 틀렸나</Lbl>
        <textarea value={cause} onChange={e=>setCause(e.target.value)} rows={3}
          style={{...inp,resize:"vertical"}} placeholder="어떤 사고 과정에서 어디가 틀렸는지"/>
      </div>

      <div style={{marginBottom:"1.2rem"}}>
        <Lbl>다음에 어떻게 할 건가</Lbl>
        <textarea value={fix} onChange={e=>setFix(e.target.value)} rows={2}
          style={{...inp,resize:"vertical"}} placeholder="구체적 행동으로"/>
      </div>

      <Btn full onClick={()=>{
        if(!cause.trim()&&!problem.trim()&&!photo&&!answerText.trim())return;
        onSave({
          id:editData?.id||Date.now(),date,subject,code,problem,cause,fix,photo,answerText,
          failCount:editData?.failCount||0,
          attemptCount:editData?.attemptCount||0,
          solved:editData?.solved||false,
        });
        onClose();
      }}>저장</Btn>

      {editData&&onDelete&&(
        <button onClick={()=>{
          if(confirm("이 오답을 삭제할까? 되돌릴 수 없어.")){
            onDelete(editData.id);
            onClose();
          }
        }} style={{
          width:"100%",marginTop:8,padding:"0.6rem",borderRadius:9,
          border:"1px solid #ef444440",background:"#ef444412",color:"#ef4444",
          fontSize:"0.8rem",fontWeight:700,cursor:"pointer"
        }}>🗑️ 이 오답 삭제</button>
      )}
    </Modal>
  );
}

// ── 오답 폴더 ──────────────────────────────────────────────────────────────────
function WrongFolder({wrongs,onDelete,onEdit,folderNames,onRenameFolder,onPractice,onPracticeGroup,onUpdateCounts}) {
  const [openSubs,setOpenSubs]=useState({});
  const [openCodes,setOpenCodes]=useState({});
  const [viewMode,setViewMode]=useState("folder");
  const [fSub,setFSub]=useState("전체");
  const [fCode,setFCode]=useState("전체");
  const [editingFolder,setEditingFolder]=useState(null);
  const [editingName,setEditingName]=useState("");

  const bySubject={};
  for(const e of wrongs){if(!bySubject[e.subject])bySubject[e.subject]=[];bySubject[e.subject].push(e);}
  const byCode2={};
  for(const e of wrongs)byCode2[e.code]=(byCode2[e.code]||0)+1;

  function getName(key){return folderNames[key]||key;}
  function startRename(e,key,cur){e.stopPropagation();setEditingFolder(key);setEditingName(cur);}
  function commitRename(){if(editingFolder&&editingName.trim())onRenameFolder(editingFolder,editingName.trim());setEditingFolder(null);}

  const filtered=wrongs.filter(e=>(fSub==="전체"||e.subject===fSub)&&(fCode==="전체"||e.code===fCode));

  return (
    <div>
      {/* 코드 분포 */}
      <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:"1rem"}}>
        {Object.entries(byCode2).sort((a,b)=>b[1]-a[1]).map(([k,v])=>{
          const c=ERROR_CODES[k];
          return <div key={k} style={{background:`${c.color}15`,border:`1px solid ${c.color}30`,borderRadius:7,padding:"0.28rem 0.6rem",display:"flex",alignItems:"center",gap:5}}>
            <Tag code={k}/><span style={{color:"#e8eaf0",fontSize:"0.78rem",fontFamily:"'JetBrains Mono',monospace",fontWeight:700}}>{v}</span>
          </div>;
        })}
        {wrongs.length===0&&<span style={{color:"#2d3241",fontSize:"0.82rem"}}>아직 오답 없음</span>}
      </div>

      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"1rem",flexWrap:"wrap",gap:8}}>
        <div style={{display:"flex",gap:3,background:"#0a0c12",border:"1px solid #1e2230",borderRadius:8,padding:3}}>
          {[["folder","폴더"],["list","목록"]].map(([v,l])=>(
            <button key={v} onClick={()=>setViewMode(v)} style={{padding:"0.32rem 0.75rem",borderRadius:5,border:"none",cursor:"pointer",
              background:viewMode===v?"#6366f1":"transparent",color:viewMode===v?"white":"#4b5563",
              fontSize:"0.76rem",fontWeight:700}}>{l}</button>
          ))}
        </div>
        <span style={{color:"#4b5563",fontSize:"0.75rem"}}>총 {wrongs.length}개</span>
      </div>

      {viewMode==="folder"&&(
        <div>
          {Object.entries(bySubject).sort((a,b)=>b[1].length-a[1].length).map(([sub,subEntries])=>{
            const c=SUBJECT_COLORS[sub];
            const subOpen=openSubs[sub];
            const byCode={};
            for(const e of subEntries){if(!byCode[e.code])byCode[e.code]=[];byCode[e.code].push(e);}
            return (
              <div key={sub} style={{marginBottom:6}}>
                <div style={{background:"#0a0c12",border:`1px solid ${c?.bg}30`,borderRadius:12,overflow:"hidden"}}>
                  <div onClick={()=>setOpenSubs(s=>({...s,[sub]:!s[sub]}))} style={{padding:"0.85rem 1.1rem",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div style={{display:"flex",alignItems:"center",gap:10}}>
                      <span>{subOpen?"📂":"📁"}</span>
                      {editingFolder===sub
                        ?<input autoFocus value={editingName} onChange={e=>setEditingName(e.target.value)}
                            onBlur={commitRename} onKeyDown={e=>{if(e.key==="Enter")commitRename();e.stopPropagation();}}
                            onClick={e=>e.stopPropagation()} style={{...inp,width:140,padding:"0.22rem 0.5rem",fontSize:"0.82rem"}}/>
                        :<span style={{color:"#f1f3f9",fontWeight:800,fontSize:"0.9rem"}}>{getName(sub)}</span>
                      }
                      <span style={{background:`${c?.bg}20`,color:c?.text,fontSize:"0.7rem",padding:"0.1rem 0.45rem",borderRadius:99,fontFamily:"'JetBrains Mono',monospace",fontWeight:700}}>{subEntries.length}</span>
                    </div>
                    <div style={{display:"flex",gap:8,alignItems:"center"}}>
                      <button onClick={e=>startRename(e,sub,getName(sub))} style={{background:"none",border:"none",color:"#4b5563",cursor:"pointer",fontSize:"0.68rem"}}>수정</button>
                      <span style={{color:"#2d3241",fontSize:"0.75rem"}}>{subOpen?"▲":"▼"}</span>
                    </div>
                  </div>
                  {subOpen&&(
                    <div style={{padding:"0 0.8rem 0.8rem",borderTop:`1px solid ${c?.bg}20`}}>
                      {Object.entries(byCode).sort((a,b)=>b[1].length-a[1].length).map(([code,codeEntries])=>{
                        const codeKey=sub+"/"+code;
                        const codeOpen=openCodes[codeKey];
                        const cc=ERROR_CODES[code]||{color:"#9ca3af",desc:code};
                        return (
                          <div key={code} style={{marginTop:6,background:"#0d0f18",border:`1px solid ${cc.color}20`,borderRadius:10,overflow:"hidden"}}>
                            <div onClick={()=>setOpenCodes(s=>({...s,[codeKey]:!s[codeKey]}))} style={{padding:"0.6rem 0.85rem",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                              <div style={{display:"flex",alignItems:"center",gap:8}}>
                                <span style={{fontSize:"0.8rem"}}>{codeOpen?"📂":"📁"}</span>
                                {editingFolder===codeKey
                                  ?<input autoFocus value={editingName} onChange={e=>setEditingName(e.target.value)}
                                      onBlur={commitRename} onKeyDown={e=>{if(e.key==="Enter")commitRename();e.stopPropagation();}}
                                      onClick={e=>e.stopPropagation()} style={{...inp,width:160,padding:"0.2rem 0.5rem",fontSize:"0.78rem"}}/>
                                  :<span style={{color:"#d1d5db",fontWeight:700,fontSize:"0.8rem"}}>{getName(codeKey)}</span>
                                }
                                <Tag code={code}/>
                                <span style={{color:"#4b5563",fontSize:"0.68rem",fontFamily:"'JetBrains Mono',monospace"}}>{codeEntries.length}개</span>
                              </div>
                              <div style={{display:"flex",gap:6,alignItems:"center"}}>
                                {onPracticeGroup&&codeEntries.some(x=>x.photo&&!x.solved)&&(
                                  <button onClick={ev=>{ev.stopPropagation();onPracticeGroup(codeEntries.filter(x=>x.photo&&!x.solved));}}
                                    style={{background:"#6366f120",border:"1px solid #6366f140",borderRadius:6,color:"#818cf8",cursor:"pointer",fontSize:"0.65rem",padding:"0.15rem 0.5rem",fontWeight:700}}>
                                    ✏️ 연속풀기 ({codeEntries.filter(x=>x.photo&&!x.solved).length})
                                  </button>
                                )}
                                {onPracticeGroup&&codeEntries.some(x=>x.photo)&&!codeEntries.some(x=>x.photo&&!x.solved)&&(
                                  <span style={{color:"#22c55e",fontSize:"0.62rem"}}>✅ 전부 맞음</span>
                                )}
                                <button onClick={e=>startRename(e,codeKey,getName(codeKey))} style={{background:"none",border:"none",color:"#4b5563",cursor:"pointer",fontSize:"0.65rem"}}>수정</button>
                                <span style={{color:"#2d3241",fontSize:"0.7rem"}}>{codeOpen?"▲":"▼"}</span>
                              </div>
                            </div>
                            {codeOpen&&(
                              <div style={{padding:"0 0.65rem 0.65rem",borderTop:`1px solid ${cc.color}15`}}>
                                {[...codeEntries].reverse().map(e=><WrongCard key={e.id} e={e} onDelete={onDelete} onEdit={onEdit} onPractice={onPractice} onUpdateCounts={onUpdateCounts}/>)}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {viewMode==="list"&&(
        <div>
          <div style={{display:"flex",gap:8,marginBottom:"1rem",flexWrap:"wrap"}}>
            <select value={fSub} onChange={e=>setFSub(e.target.value)} style={{...inp,width:"auto"}}>
              <option>전체</option>{SUBJECTS.map(s=><option key={s}>{s}</option>)}
            </select>
            <select value={fCode} onChange={e=>setFCode(e.target.value)} style={{...inp,width:"auto"}}>
              <option>전체</option>{Object.keys(ERROR_CODES).map(k=><option key={k}>{k}</option>)}
            </select>
            <span style={{color:"#4b5563",fontSize:"0.78rem",alignSelf:"center"}}>{filtered.length}개</span>
          </div>
          {[...filtered].reverse().map(e=><WrongCard key={e.id} e={e} onDelete={onDelete} onEdit={onEdit} onPractice={onPractice} onUpdateCounts={onUpdateCounts}/>)}
        </div>
      )}
    </div>
  );
}

function WrongCard({e,onDelete,onEdit,onPractice,onUpdateCounts}) {
  const [open,setOpen]=useState(false);
  const [editingCounts,setEditingCounts]=useState(false);
  const [failInput,setFailInput]=useState(e.failCount||0);
  const [solvedInput,setSolvedInput]=useState(!!e.solved);
  const c=SUBJECT_COLORS[e.subject];

  function saveCounts(){
    onUpdateCounts(e.id, { failCount: Math.max(0, parseInt(failInput)||0), solved: solvedInput });
    setEditingCounts(false);
  }

  return (
    <div style={{background:"#0d0f18",border:"1px solid #1e2230",borderRadius:9,marginBottom:5,overflow:"hidden"}}>
      <div onClick={()=>setOpen(o=>!o)} style={{padding:"0.65rem 0.9rem",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{display:"flex",alignItems:"center",gap:7,flexWrap:"wrap"}}>
          <span style={{color:c?.text||"#a5b4fc",fontSize:"0.75rem",fontWeight:800}}>{e.subject}</span>
          <Tag code={e.code}/>
          {e.photo&&<span style={{fontSize:"0.7rem"}}>📷</span>}
          {e.solved&&<span style={{color:"#22c55e",fontSize:"0.68rem",fontWeight:700,background:"#22c55e18",padding:"0.05rem 0.4rem",borderRadius:99}}>✅ 맞음</span>}
          {e.failCount>0&&<span style={{color:"#ef4444",fontSize:"0.68rem",fontFamily:"'JetBrains Mono',monospace",fontWeight:700}}>❌×{e.failCount}</span>}
          <span style={{color:"#6b7280",fontSize:"0.75rem"}}>{e.problem||e.cause.slice(0,25)+(e.cause.length>25?"...":"")}</span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
          <span style={{color:"#2d3241",fontSize:"0.65rem",fontFamily:"'JetBrains Mono',monospace"}}>{e.date}</span>
          {e.photo&&onPractice&&<button onClick={ev=>{ev.stopPropagation();onPractice(e);}} style={{background:"#6366f120",border:"1px solid #6366f140",borderRadius:6,color:"#818cf8",cursor:"pointer",fontSize:"0.68rem",padding:"0.15rem 0.5rem",fontWeight:700}}>✏️ 풀기</button>}
          <button onClick={ev=>{ev.stopPropagation();onEdit(e);}} style={{background:"none",border:"none",color:"#6366f1",cursor:"pointer",fontSize:"0.7rem"}}>수정</button>
          <button onClick={ev=>{ev.stopPropagation();onDelete(e.id);}} style={{background:"none",border:"none",color:"#2d3241",cursor:"pointer",fontSize:"0.82rem"}}>×</button>
          <span style={{color:"#2d3241",fontSize:"0.7rem"}}>{open?"▲":"▼"}</span>
        </div>
      </div>
      {open&&(
        <div style={{padding:"0 0.9rem 0.85rem",borderTop:"1px solid #1a1d27"}}>
          {e.cause&&<div style={{color:"#9ca3af",fontSize:"0.8rem",lineHeight:1.75,marginTop:8}}>{e.cause}</div>}
          {e.fix&&<div style={{color:"#10b981",fontSize:"0.76rem",marginTop:5}}>→ {e.fix}</div>}
          {e.answerText&&<div style={{color:"#6366f1",fontSize:"0.76rem",marginTop:5}}>정답: {e.answerText}</div>}
          {e.photo&&<img src={e.photo} alt="오답" style={{marginTop:8,maxWidth:"100%",maxHeight:220,borderRadius:8,border:"1px solid #1e2230",objectFit:"contain",display:"block"}}/>}

          {/* 풀이 기록 수정 */}
          {onUpdateCounts && (
            <div style={{marginTop:10,paddingTop:8,borderTop:"1px solid #1a1d27"}}>
              {!editingCounts ? (
                <button onClick={()=>{setFailInput(e.failCount||0);setSolvedInput(!!e.solved);setEditingCounts(true);}} style={{
                  background:"none",border:"1px solid #2a2d3a",borderRadius:7,color:"#6b7280",cursor:"pointer",
                  fontSize:"0.7rem",padding:"0.25rem 0.6rem"
                }}>풀이 기록 수정 (틀림 {e.failCount||0}회{e.solved?" · 맞음":""})</button>
              ) : (
                <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                  <label style={{display:"flex",alignItems:"center",gap:5,fontSize:"0.75rem",color:"#9ca3af"}}>
                    틀린 횟수
                    <input type="number" min={0} value={failInput} onChange={ev=>setFailInput(ev.target.value)}
                      style={{width:52,background:"#111318",border:"1px solid #2a2d3a",borderRadius:6,color:"#e8eaf0",padding:"0.2rem 0.4rem",fontSize:"0.78rem"}}/>
                  </label>
                  <label style={{display:"flex",alignItems:"center",gap:5,fontSize:"0.75rem",color:"#9ca3af",cursor:"pointer"}}>
                    <input type="checkbox" checked={solvedInput} onChange={ev=>setSolvedInput(ev.target.checked)}/>
                    맞음 표시
                  </label>
                  <button onClick={saveCounts} style={{background:"#22c55e18",border:"1px solid #22c55e40",borderRadius:6,color:"#22c55e",cursor:"pointer",fontSize:"0.72rem",padding:"0.2rem 0.6rem",fontWeight:700}}>저장</button>
                  <button onClick={()=>setEditingCounts(false)} style={{background:"none",border:"none",color:"#4b5563",cursor:"pointer",fontSize:"0.72rem"}}>취소</button>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}


// ── 문제풀이 모드 (사진 + 필기 + 답 가리기) ────────────────────────────────────
function DrawingCanvas({bgImage, height=380}) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [drawing,setDrawing]=useState(false);
  const [color,setColor]=useState("#ef4444");
  const [lineWidth,setLineWidth]=useState(3);
  const [tool,setTool]=useState("pen"); // pen | eraser
  const lastPos = useRef(null);

  // 캔버스는 완전히 투명한 필기 레이어. 배경 이미지는 별도 <img>로 그 아래 깔림.
  useEffect(()=>{
    const canvas=canvasRef.current;
    if(!canvas)return;
    const ctx=canvas.getContext("2d");
    // 실제 픽셀 해상도를 표시 크기에 맞춤 (레티나 대응 생략, 640 고정폭 사용)
    ctx.clearRect(0,0,canvas.width,canvas.height);
  },[bgImage]);

  function getPos(e){
    const canvas=canvasRef.current;
    const rect=canvas.getBoundingClientRect();
    const clientX = e.touches? e.touches[0].clientX : e.clientX;
    const clientY = e.touches? e.touches[0].clientY : e.clientY;
    return { x:(clientX-rect.left)*(canvas.width/rect.width), y:(clientY-rect.top)*(canvas.height/rect.height) };
  }

  function start(e){
    e.preventDefault();
    setDrawing(true);
    lastPos.current=getPos(e);
  }
  function move(e){
    if(!drawing)return;
    e.preventDefault();
    const canvas=canvasRef.current;
    const ctx=canvas.getContext("2d");
    const pos=getPos(e);
    // 지우개도 destination-out을 쓰되, 캔버스 자체가 투명 필기 레이어라
    // 배경 이미지는 절대 지워지지 않음 (별도 <img> 레이어이므로)
    ctx.globalCompositeOperation = tool==="eraser" ? "destination-out" : "source-over";
    ctx.strokeStyle=color;
    ctx.lineWidth=tool==="eraser"?24:lineWidth;
    ctx.lineCap="round";
    ctx.lineJoin="round";
    ctx.beginPath();
    ctx.moveTo(lastPos.current.x,lastPos.current.y);
    ctx.lineTo(pos.x,pos.y);
    ctx.stroke();
    lastPos.current=pos;
  }
  function end(){ setDrawing(false); lastPos.current=null; }

  function clearDrawing(){
    // 필기 레이어만 지움. 배경 이미지는 별도 레이어라 영향 없음.
    const canvas=canvasRef.current;
    const ctx=canvas.getContext("2d");
    ctx.clearRect(0,0,canvas.width,canvas.height);
  }

  const PEN_COLORS=["#ef4444","#3b82f6","#22c55e","#000000","#f59e0b"];

  return (
    <div>
      {/* 도구 */}
      <div style={{display:"flex",gap:6,marginBottom:8,flexWrap:"wrap",alignItems:"center"}}>
        <div style={{display:"flex",gap:4}}>
          {PEN_COLORS.map(cl=>(
            <button key={cl} onClick={()=>{setColor(cl);setTool("pen");}} style={{
              width:24,height:24,borderRadius:"50%",background:cl,cursor:"pointer",
              border:tool==="pen"&&color===cl?"2px solid white":"2px solid transparent",
              boxShadow:tool==="pen"&&color===cl?`0 0 0 2px ${cl}`:undefined
            }}/>
          ))}
        </div>
        <button onClick={()=>setTool("eraser")} style={{
          padding:"0.3rem 0.7rem",borderRadius:7,cursor:"pointer",
          border:tool==="eraser"?"1px solid #f59e0b":"1px solid #2a2d3a",
          background:tool==="eraser"?"#f59e0b20":"#111318",
          color:tool==="eraser"?"#f59e0b":"#6b7280",
          fontSize:"0.72rem",fontWeight:700
        }}>지우개 (필기만 지움)</button>
        <div style={{display:"flex",gap:3,alignItems:"center"}}>
          {[2,4,7].map(w=>(
            <button key={w} onClick={()=>{setLineWidth(w);setTool("pen");}} style={{
              width:26,height:26,borderRadius:6,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",
              border:lineWidth===w?"1px solid #6366f1":"1px solid #2a2d3a",background:lineWidth===w?"#6366f120":"#111318"
            }}><div style={{width:w+2,height:w+2,borderRadius:"50%",background:"#9ca3af"}}/></button>
          ))}
        </div>
        <button onClick={clearDrawing} style={{marginLeft:"auto",padding:"0.3rem 0.7rem",borderRadius:7,border:"1px solid #2a2d3a",background:"#111318",color:"#6b7280",fontSize:"0.72rem",cursor:"pointer"}}>필기 전체 지우기</button>
      </div>

      {/* 배경 이미지 + 필기 캔버스를 겹친 컨테이너 */}
      <div ref={containerRef} style={{
        position:"relative", width:"100%", height, borderRadius:10, overflow:"hidden",
        background:"#0d0f18", border:"1px solid #1e2230"
      }}>
        {bgImage && (
          <img src={bgImage} alt="문제" draggable={false} style={{
            position:"absolute", inset:0, width:"100%", height:"100%",
            objectFit:"contain", pointerEvents:"none", userSelect:"none"
          }}/>
        )}
        <canvas ref={canvasRef} width={640} height={height}
          onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
          onTouchStart={start} onTouchMove={move} onTouchEnd={end}
          style={{
            position:"absolute", inset:0, width:"100%", height:"100%",
            touchAction:"none", cursor:"crosshair", display:"block", background:"transparent"
          }}/>
      </div>
    </div>
  );
}

function PracticeMode({queue, onExit, onResult}) {
  const [idx,setIdx]=useState(0);
  const [showAnswer,setShowAnswer]=useState(false);
  const [results,setResults]=useState({correct:0, wrong:0});
  const [canvasKey,setCanvasKey]=useState(0);
  const [successStreak,setSuccessStreak]=useState(()=>queue?.[0]?.correctStreak||0);

  const current = queue[idx];
  const isLast = idx>=queue.length-1;

  // 연습 화면을 나갔다 다시 들어와도 저장된 연속 성공 횟수에서 이어서 시작한다.
  // 같은 문제를 다시 푸는 동안에는 queue 원본이 갱신되지 않으므로 idx가 바뀔 때만 동기화한다.
  useEffect(()=>{
    setSuccessStreak(queue?.[idx]?.correctStreak||0);
  },[idx,queue]);

  function mark(result){ // "correct" | "wrong"
    const nextStreak = result==="correct" ? successStreak+1 : 0;
    onResult(current, result, nextStreak>=2);
    setResults(r=>({...r, [result]: r[result]+1}));

    // 오답은 같은 문제를 다시 풀고, 맞아도 1회째라면 같은 문제를 한 번 더 연속으로 맞혀야 함.
    if(result!=="correct" || nextStreak<2){
      setSuccessStreak(result==="correct" ? nextStreak : 0);
      setShowAnswer(false);
      setCanvasKey(k=>k+1);
      return;
    }

    // 2회 연속 성공 → 다음 문제로 이동
    setSuccessStreak(0);
    if(!isLast){
      setIdx(i=>i+1);
      setShowAnswer(false);
      setCanvasKey(k=>k+1);
    } else {
      // finished
      setTimeout(()=>{
        alert(`연속 풀기 완료!\n맞음 ${results.correct+(result==="correct"?1:0)}개 · 틀림 ${results.wrong+(result==="wrong"?1:0)}개`);
        onExit();
      },100);
    }
  }

  if(!current) return null;
  const c=SUBJECT_COLORS[current.subject];

  return (
    <div style={{position:"fixed",inset:0,background:"#050609",zIndex:998,overflowY:"auto"}}>
      {/* 상단 바 */}
      <div style={{position:"sticky",top:0,background:"rgba(5,6,9,0.97)",backdropFilter:"blur(12px)",
        borderBottom:"1px solid #1a1d27",padding:"0.85rem 1.2rem",display:"flex",justifyContent:"space-between",alignItems:"center",zIndex:10}}>
        <div style={{display:"flex",alignItems:"center",gap:10}}>
          <button onClick={onExit} style={{background:"none",border:"none",color:"#6b7280",cursor:"pointer",fontSize:"1.1rem"}}>←</button>
          <span style={{color:c?.text||"#a5b4fc",fontWeight:800,fontSize:"0.9rem"}}>{current.subject}</span>
          <Tag code={current.code}/>
          {current.failCount>0&&<span style={{color:"#ef4444",fontSize:"0.72rem",fontFamily:"'JetBrains Mono',monospace",fontWeight:700}}>❌×{current.failCount} 누적</span>}
        </div>
        <div style={{display:"flex",gap:10,alignItems:"center"}}>
          <span style={{color:"#22c55e",fontSize:"0.78rem",fontFamily:"'JetBrains Mono',monospace"}}>✅{results.correct}</span>
          <span style={{color:"#ef4444",fontSize:"0.78rem",fontFamily:"'JetBrains Mono',monospace"}}>❌{results.wrong}</span>
          <span style={{color:"#4b5563",fontSize:"0.75rem"}}>{idx+1}/{queue.length}</span>
        </div>
      </div>

      <div style={{maxWidth:720,margin:"0 auto",padding:"1.2rem"}}>
        {current.problem&&<div style={{color:"#9ca3af",fontSize:"0.85rem",marginBottom:10}}>{current.problem}</div>}

        {/* 문제 사진 + 필기 캔버스 */}
        <div style={{marginBottom:"1rem"}}>
          <div style={{color:"#4b5563",fontSize:"0.7rem",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:6}}>문제 (여기에 직접 풀어봐)</div>
          <DrawingCanvas key={canvasKey} bgImage={current.photo} height={420}/>
        </div>

        {/* 답 보기 버튼 / 답 표시 */}
        {!showAnswer ? (
          <Btn full color="#f59e0b" onClick={()=>setShowAnswer(true)}>👁️ 답 보기</Btn>
        ) : (
          <div style={{marginBottom:"1rem"}}>
            <div style={{color:"#22c55e",fontSize:"0.7rem",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:6}}>정답</div>
            {current.answerText ? (
              <div style={{background:"#0a0c12",border:"1px solid #22c55e30",borderRadius:10,padding:"1rem",color:"#e8eaf0",fontSize:"1rem",fontWeight:700}}>
                {current.answerText}
              </div>
            ) : (
              <div style={{background:"#0a0c12",border:"1px solid #1e2230",borderRadius:10,padding:"1rem",color:"#4b5563",fontSize:"0.82rem"}}>
                등록된 정답이 없어. 오답 수정에서 추가할 수 있어.
              </div>
            )}
            {current.cause&&<div style={{marginTop:8,padding:"0.7rem 0.9rem",background:"#0a0c12",border:"1px solid #1e2230",borderRadius:9,color:"#9ca3af",fontSize:"0.78rem",lineHeight:1.6}}>
              <span style={{color:"#6b7280"}}>이전 틀린 이유: </span>{current.cause}
            </div>}
          </div>
        )}

        {/* 채점 버튼 */}
        {showAnswer && (
          <div style={{display:"flex",gap:8,marginTop:"1rem"}}>
            <button onClick={()=>mark("wrong")} style={{
              flex:1,padding:"0.9rem",borderRadius:12,border:"1px solid #ef444450",
              background:"#ef444418",color:"#ef4444",
              fontSize:"0.95rem",fontWeight:800,cursor:"pointer"
            }}>❌ 틀렸어</button>
            <button onClick={()=>mark("correct")} style={{
              flex:1,padding:"0.9rem",borderRadius:12,border:"1px solid #22c55e50",
              background:"#22c55e18",color:"#22c55e",
              fontSize:"0.95rem",fontWeight:800,cursor:"pointer"
            }}>✅ 맞았어</button>
          </div>
        )}

        {isLast && showAnswer && <div style={{textAlign:"center",color:"#4b5563",fontSize:"0.75rem",marginTop:10}}>마지막 문제야</div>}
      </div>
    </div>
  );
}

// ── 기간별 리포트 내보내기 ──────────────────────────────────────────────────────
function buildReportText(data, period) {
  const now = new Date();
  const cutoff = new Date();
  const pLabel = {day:"1일", week:"1주", month:"1개월", quarter:"3개월"}[period];
  if(period==="day") cutoff.setDate(now.getDate()-1);
  else if(period==="week") cutoff.setDate(now.getDate()-7);
  else if(period==="month") cutoff.setMonth(now.getMonth()-1);
  else cutoff.setMonth(now.getMonth()-3);

  // 타임테이블 집계
  const subMinsTotal={};
  let totalMins=0;
  const dailyMins={};
  for(const [dateStr,slots] of Object.entries(data.timetable||{})){
    if(new Date(dateStr)<cutoff) continue;
    const sm=calcSubjectMinutes(slots);
    const dayTotal=calcMinutes(slots);
    if(dayTotal>0) dailyMins[dateStr]=dayTotal;
    for(const [s,m] of Object.entries(sm)){subMinsTotal[s]=(subMinsTotal[s]||0)+m;totalMins+=m;}
  }

  // 오답 집계
  const wrongs=(data.wrongs||[]).filter(w=>new Date(w.date)>=cutoff);
  const byCode={}, bySubject={}, byCodeSubject={};
  for(const w of wrongs){
    byCode[w.code]=(byCode[w.code]||0)+1;
    bySubject[w.subject]=(bySubject[w.subject]||0)+1;
    const k=w.subject+"/"+w.code;
    byCodeSubject[k]=(byCodeSubject[k]||0)+1;
  }

  // 계획 집계 — 원본 삭제는 tombstone으로 동기화하고, 삭제 이유는 date=0000-00-00인 별도 로그 item으로 보존
  const allPlanRecords=(data.plans2||[]);
  const deletedPlans=allPlanRecords.filter(p=>p.status==="deletedLog"&&(Number(p.deletedAt)||0)>=cutoff.getTime());
  const plans=allPlanRecords.filter(p=>p.status!=="deletedLog"&&new Date(p.date)>=cutoff);
  const planDone=plans.filter(p=>p.status==="done").length;
  const planFailed=plans.filter(p=>p.status==="failed").length;
  const planTodo=plans.filter(p=>p.status==="todo").length;
  // 이월(실패 반복)로 같은 계획이 여러 항목으로 쪼개져도 중복 없이 세기 (과거 데이터도 소급 적용)
  const uniqueRootIds = new Set(plans.map(resolvePlanRoot));
  const uniquePlanCount = uniqueRootIds.size;

  const lines=[];
  lines.push(`=== STUDY_OS 리포트 : 최근 ${pLabel} ===`);
  lines.push(`생성일: ${todayStr()}`);
  lines.push("");
  lines.push(`[학습 시간]`);
  lines.push(`총 공부시간: ${Math.floor(totalMins/60)}시간 ${totalMins%60}분`);
  lines.push(`기록된 날짜 수: ${Object.keys(dailyMins).length}일`);
  if(Object.keys(dailyMins).length>0){
    const avgDay=totalMins/Object.keys(dailyMins).length;
    lines.push(`일 평균: ${Math.floor(avgDay/60)}시간 ${Math.round(avgDay%60)}분`);
  }
  lines.push("");
  lines.push(`[과목별 시간]`);
  if(Object.keys(subMinsTotal).length===0) lines.push("기록 없음");
  else Object.entries(subMinsTotal).sort((a,b)=>b[1]-a[1]).forEach(([s,m])=>{
    lines.push(`- ${s}: ${Math.floor(m/60)}시간 ${m%60}분 (${((m/totalMins)*100).toFixed(0)}%)`);
  });
  lines.push("");
  lines.push(`[오답 현황] 총 ${wrongs.length}개`);
  lines.push(`오답 코드별:`);
  if(Object.keys(byCode).length===0) lines.push("- 없음");
  else Object.entries(byCode).sort((a,b)=>b[1]-a[1]).forEach(([k,v])=>{
    const desc=ERROR_CODES[k]?.desc||"";
    lines.push(`- ${k} (${desc}): ${v}개 (${((v/wrongs.length)*100).toFixed(0)}%)`);
  });
  lines.push("");
  lines.push(`과목별 오답:`);
  if(Object.keys(bySubject).length===0) lines.push("- 없음");
  else Object.entries(bySubject).sort((a,b)=>b[1]-a[1]).forEach(([k,v])=>{
    lines.push(`- ${k}: ${v}개`);
  });
  lines.push("");
  lines.push(`과목x코드 조합 (가장 많이 틀린 유형):`);
  const topCombos=Object.entries(byCodeSubject).sort((a,b)=>b[1]-a[1]).slice(0,5);
  if(topCombos.length===0) lines.push("- 없음");
  else topCombos.forEach(([k,v])=>lines.push(`- ${k}: ${v}개`));
  lines.push("");
  lines.push(`[오답 상세 목록]`);
  if(wrongs.length===0) lines.push("- 없음");
  else wrongs.slice().reverse().forEach(w=>{
    lines.push(`- [${w.date}] ${w.subject}/${w.code}${w.problem?" ("+w.problem+")":""}${w.cause?" : "+w.cause:""}${w.answerText?" [정답: "+w.answerText+"]":""}${w.fix?" → "+w.fix:""}${w.failCount?` [누적틀림 ${w.failCount}회]`:""}`);
  });
  lines.push("");
  lines.push(`[계획 수행 현황]`);
  lines.push(`고유 계획: ${uniquePlanCount}개 (이월 포함 총 시도 ${plans.length}회) | 완료: ${planDone}개 | 실패: ${planFailed}개 | 예정: ${planTodo}개 | 삭제: ${deletedPlans.length}개`);
  if(uniquePlanCount>0) lines.push(`달성률: ${Math.round((planDone/uniquePlanCount)*100)}% (고유 계획 기준)`);

  // 실패는 같은 날 여러 계획이 같은 원인으로 무너지는 경우가 많으므로 "발생 일수" 중심으로 분석
  const failedPlans = plans.filter(p=>p.status==="failed");
  if(failedPlans.length>0){
    lines.push("");
    const failedDays=new Set(failedPlans.map(p=>p.date));
    lines.push(`[실패 원인 분석] 실패 계획 ${failedPlans.length}개 · 실패 발생 ${failedDays.size}일`);
    const byReason={};
    failedPlans.forEach(p=>{const r=p.failReason||"미분류";if(!byReason[r])byReason[r]=[];byReason[r].push(p);});
    Object.entries(byReason).sort((a,b)=>new Set(b[1].map(p=>p.date)).size-new Set(a[1].map(p=>p.date)).size||b[1].length-a[1].length).forEach(([code,list])=>{
      const label=FAIL_REASONS[code]?.label||code;
      const dayCount=new Set(list.map(p=>p.date)).size;
      lines.push(`${label}: ${dayCount}일 · ${list.length}개 계획`);
      [...new Set(list.map(p=>p.date))].slice(0,7).forEach(d=>lines.push(`  - ${d}: ${list.filter(p=>p.date===d).length}개`));
    });
  }
  if(deletedPlans.length>0){
    lines.push("");
    lines.push(`[계획 삭제 이유] 총 ${deletedPlans.length}개`);
    const byDeleteReason={};
    deletedPlans.forEach(p=>{const r=p.deleteReason||"미분류";if(!byDeleteReason[r])byDeleteReason[r]=[];byDeleteReason[r].push(p);});
    Object.entries(byDeleteReason).sort((a,b)=>b[1].length-a[1].length).forEach(([code,list])=>{
      const label=DELETE_REASONS[code]?.label||code;
      lines.push(`${label}: ${list.length}개 (${Math.round((list.length/deletedPlans.length)*100)}%)`);
      list.slice(0,5).forEach(p=>lines.push(`  - [${p.originalDate||"?"}|${p.subject}] ${p.content.slice(0,30)}`));
    });
  }

  const trackedPlans = plans.filter(p=>p.totalMinutes>0);
  if(trackedPlans.length>0){
    const totalTrackedMin = trackedPlans.reduce((a,p)=>a+p.totalMinutes,0);
    lines.push(`타이머 기록 총합: ${Math.floor(totalTrackedMin/60)}시간 ${totalTrackedMin%60}분 (${trackedPlans.length}개 계획)`);
    [...trackedPlans].sort((a,b)=>b.totalMinutes-a.totalMinutes).forEach(p=>{
      lines.push(`- [${p.subject}] ${p.content.slice(0,40)}: ${Math.floor(p.totalMinutes/60)}h ${p.totalMinutes%60}m`);
      (p.sessions||[]).forEach(s=>{
        const start=new Date(s.startedAt);
        const end=new Date(s.endedAt||s.startedAt+s.minutes*60000);
        const fmt=t=>`${String(t.getHours()).padStart(2,"0")}:${String(t.getMinutes()).padStart(2,"0")}`;
        lines.push(`    · ${s.date} ${fmt(start)}~${fmt(end)} (${s.minutes}분)`);
      });
    });
  }

  // 주간/월간 목표 (목표 탭)
  const goalItems = (data.goalItems||[]).filter(g=>{
    // scopeKey가 주(YYYY-Www) 또는 월(YYYY-MM) 문자열이라 날짜 파싱 후 cutoff 비교
    const approxDate = g.scope==="month" ? `${g.scopeKey}-01` : g.scopeKey.split("-W")[0]+"-01-01";
    return new Date(approxDate) >= new Date(cutoff.getFullYear(), cutoff.getMonth()-2, 1); // 목표는 넉넉하게 최근 것 포함
  });
  const weekGoalItems = goalItems.filter(g=>g.scope==="week");
  const monthGoalItems = goalItems.filter(g=>g.scope==="month");
  lines.push("");
  lines.push(`[월간 목표] 총 ${monthGoalItems.length}개`);
  if(monthGoalItems.length===0) lines.push("- 없음");
  else {
    const byMonth={};
    monthGoalItems.forEach(g=>{ if(!byMonth[g.scopeKey]) byMonth[g.scopeKey]=[]; byMonth[g.scopeKey].push(g); });
    Object.entries(byMonth).sort((a,b)=>a[0].localeCompare(b[0])).forEach(([mk,list])=>{
      lines.push(`${mk}:`);
      list.forEach(g=>{
        lines.push(`  - [${g.subject}] ${g.content}${g.status==="done"?" ✅완료":""}${g.note?" · "+g.note:""}`);
      });
    });
  }
  lines.push("");
  lines.push(`[주간 목표] 총 ${weekGoalItems.length}개`);
  if(weekGoalItems.length===0) lines.push("- 없음");
  else {
    const byWeekG={};
    weekGoalItems.forEach(g=>{ if(!byWeekG[g.scopeKey]) byWeekG[g.scopeKey]=[]; byWeekG[g.scopeKey].push(g); });
    Object.entries(byWeekG).sort((a,b)=>a[0].localeCompare(b[0])).forEach(([wk,list])=>{
      lines.push(`${wk}:`);
      list.forEach(g=>{
        lines.push(`  - [${g.subject}] ${g.content}${g.status==="done"?" ✅완료":""}${g.note?" · "+g.note:""}`);
      });
    });
  }

  // 날짜별 계획 메모 (타임테이블 옆 자유 메모)
  const dailyMemos = Object.entries(data.plans||{}).filter(([d])=>new Date(d)>=cutoff && new Date(d)<=now);
  lines.push("");
  lines.push(`[날짜별 계획 메모] ${dailyMemos.length}일`);
  if(dailyMemos.length===0) lines.push("- 없음");
  else dailyMemos.sort((a,b)=>a[0].localeCompare(b[0])).forEach(([d,memo])=>{
    if(memo && memo.trim()) lines.push(`- [${d}] ${memo}`);
  });

  // 밤 마무리 한줄
  const nightNotes = Object.entries(data.nightNotes||{}).filter(([d])=>new Date(d)>=cutoff && new Date(d)<=now);
  lines.push("");
  lines.push(`[밤 마무리 한줄] ${nightNotes.length}일`);
  if(nightNotes.length===0) lines.push("- 없음");
  else nightNotes.sort((a,b)=>a[0].localeCompare(b[0])).forEach(([d,note])=>{
    if(note && note.trim()) lines.push(`- [${d}] ${note}`);
  });

  lines.push("");
  lines.push(`=== 리포트 끝 ===`);

  return lines.join("\n");
}

function ReportExport({data, onClose}) {
  const [period,setPeriod]=useState("week");
  const text = buildReportText(data, period);

  function copyText(){
    navigator.clipboard?.writeText(text).then(()=>{
      alert("복사됐어! Claude 채팅에 붙여넣기 해줘.");
    }).catch(()=>{
      alert("복사 실패. 아래 텍스트를 직접 선택해서 복사해줘.");
    });
  }

  return (
    <Modal title="📋 기간별 리포트 내보내기" onClose={onClose} wide>
      <div style={{display:"flex",gap:5,marginBottom:"1rem",flexWrap:"wrap"}}>
        {[["day","1일"],["week","1주"],["month","1개월"],["quarter","3개월"]].map(([v,l])=>(
          <button key={v} onClick={()=>setPeriod(v)} style={{
            padding:"0.4rem 0.9rem",borderRadius:8,border:"none",cursor:"pointer",
            background:period===v?"#6366f1":"#111318",
            color:period===v?"white":"#6b7280",
            fontSize:"0.8rem",fontWeight:700
          }}>{l}</button>
        ))}
      </div>
      <p style={{color:"#6b7280",fontSize:"0.78rem",marginBottom:"0.8rem",lineHeight:1.6}}>
        아래 텍스트를 복사해서 Claude 채팅에 붙여넣으면, 학습 그래프 분석과 자주 틀린 오류 유형을 짚어줄 수 있어.
      </p>
      <Btn full onClick={copyText}>📋 텍스트 복사하기</Btn>
      <textarea readOnly value={text} rows={16}
        style={{...inp,marginTop:"1rem",resize:"vertical",fontSize:"0.72rem",color:"#9ca3af",fontFamily:"'JetBrains Mono',monospace",lineHeight:1.6}}
        onFocus={e=>e.target.select()}/>
    </Modal>
  );
}

// ── 백업 ──────────────────────────────────────────────────────────────────────
function BackupModal({data,onImport,onClose}) {
  const [tab,setTab]=useState("export");
  const [importText,setImportText]=useState("");
  const [msg,setMsg]=useState("");
  const [showText,setShowText]=useState(false);
  const jsonText=JSON.stringify(data);
  const snapshots = listSnapshots();
  const snapshotDates = Object.keys(snapshots).sort().reverse();

  function doExport(){
    try{const b=new Blob([jsonText],{type:"application/json"});const a=document.createElement("a");a.href=URL.createObjectURL(b);a.download=`studyos_${todayStr()}.json`;a.click();}catch(e){}
    setShowText(true);
  }
  function doImport(){
    try{const p=JSON.parse(importText);if(!p.wrongs&&!p.timetable){setMsg("형식 오류");return;}onImport({...initialData,...p});setMsg("완료!");}
    catch{setMsg("파싱 오류");}
  }
  function restoreSnapshot(date){
    const snap = snapshots[date];
    if (!snap) return;
    if (!confirm(`${date} 시점 데이터로 되돌릴까? 지금 데이터는 사라져 (미리 내보내기로 백업 권장).`)) return;
    onImport({...initialData, ...snap.data});
    onClose();
  }

  return (
    <Modal title="데이터 백업/복원" onClose={onClose}>
      <div style={{display:"flex",gap:3,background:"#111318",borderRadius:8,padding:3,marginBottom:"1.2rem",border:"1px solid #1e2230"}}>
        {[["export","내보내기"],["import","가져오기"],["snapshot","자동 스냅샷"]].map(([v,l])=>(
          <button key={v} onClick={()=>setTab(v)} style={{flex:1,padding:"0.42rem",borderRadius:5,border:"none",cursor:"pointer",
            background:tab===v?"#6366f1":"transparent",color:tab===v?"white":"#4b5563",
            fontSize:"0.78rem",fontWeight:700}}>{l}</button>
        ))}
      </div>
      {tab==="export"&&<div>
        <div style={{display:"flex",gap:16,flexWrap:"wrap",marginBottom:"1rem"}}>
          {[["타임블록",Object.keys(data.timetable||{}).length+"일"],["오답",data.wrongs.length+"개"]].map(([l,v])=>(
            <div key={l} style={{textAlign:"center"}}>
              <div style={{color:"#6366f1",fontSize:"1.3rem",fontWeight:800,fontFamily:"'JetBrains Mono',monospace"}}>{v}</div>
              <div style={{color:"#4b5563",fontSize:"0.7rem"}}>{l}</div>
            </div>
          ))}
        </div>
        <p style={{color:"#f59e0b",fontSize:"0.76rem",marginBottom:"1rem"}}>캐시 지우기 전에 반드시 백업해줘.</p>
        <Btn full onClick={doExport}>JSON 내보내기</Btn>
        {showText&&<div style={{marginTop:"1rem"}}>
          <div style={{color:"#22c55e",fontSize:"0.75rem",marginBottom:6}}>전체 선택 후 복사 → 구글 드라이브에 저장</div>
          <textarea readOnly value={jsonText} rows={5} style={{...inp,fontSize:"0.68rem",color:"#4b5563",resize:"vertical"}} onFocus={e=>e.target.select()}/>
        </div>}
      </div>}
      {tab==="import"&&<div>
        <textarea value={importText} onChange={e=>setImportText(e.target.value)} rows={6}
          style={{...inp,resize:"vertical",marginBottom:"1rem"}} placeholder="내보낸 JSON 붙여넣기"/>
        {msg&&<div style={{color:msg==="완료!"?"#22c55e":"#ef4444",fontSize:"0.8rem",marginBottom:"0.8rem"}}>{msg}</div>}
        <Btn full color="#f59e0b" onClick={doImport}>가져오기 (덮어쓰기)</Btn>
      </div>}
      {tab==="snapshot"&&<div>
        <p style={{color:"#6b7280",fontSize:"0.78rem",marginBottom:"1rem",lineHeight:1.6}}>
          클라우드 동기화가 성공할 때마다 이 기기에 자동으로 하루치 스냅샷이 남아. 실수로 데이터가 사라졌을 때 최근 7일 중 하나로 되돌릴 수 있어.
        </p>
        {snapshotDates.length===0
          ? <div style={{color:"#2d3241",fontSize:"0.82rem",textAlign:"center",padding:"2rem 0"}}>아직 저장된 스냅샷이 없어</div>
          : snapshotDates.map(d=>{
              const snap=snapshots[d];
              const w=(snap.data.wrongs||[]).length;
              const tt=Object.keys(snap.data.timetable||{}).length;
              return (
                <div key={d} style={{display:"flex",justifyContent:"space-between",alignItems:"center",background:"#0a0c12",border:"1px solid #1e2230",borderRadius:9,padding:"0.7rem 0.9rem",marginBottom:7}}>
                  <div>
                    <div style={{color:"#e8eaf0",fontSize:"0.82rem",fontWeight:700,fontFamily:"'JetBrains Mono',monospace"}}>{d}</div>
                    <div style={{color:"#4b5563",fontSize:"0.68rem"}}>오답 {w}개 · 타임블록 {tt}일</div>
                  </div>
                  <button onClick={()=>restoreSnapshot(d)} style={{background:"#f59e0b18",border:"1px solid #f59e0b40",borderRadius:7,color:"#fbbf24",cursor:"pointer",fontSize:"0.74rem",fontWeight:700,padding:"0.35rem 0.8rem"}}>이 시점으로</button>
                </div>
              );
            })
        }
      </div>}
    </Modal>
  );
}


// ── 주간/월간 목표 배너 ──────────────────────────────────────────────────────────
function addMonths(dateStr, n) {
  const d = new Date(dateStr); d.setMonth(d.getMonth() + n);
  return d.toISOString().slice(0,10);
}
function weekRangeLabel(dateStr) {
  const d = new Date(dateStr);
  const day = d.getDay();
  const mon = new Date(d); mon.setDate(d.getDate() - (day===0?6:day-1));
  const sun = new Date(mon); sun.setDate(mon.getDate()+6);
  const fmt = x => `${x.getMonth()+1}/${x.getDate()}`;
  return `${fmt(mon)} ~ ${fmt(sun)}`;
}

// ── 목표 섹션 (주/달 독립 네비게이션 — 언제든 손쉽게 세우고 수정) ─────────────────
// ── 목표 전용 페이지 (월 단위로 이동, 그 달의 주차별 목표를 카드로 펼쳐 보여줌) ─────
function GoalOverview({data, setData}) {
  const [monthOffset,setMonthOffset]=useState(0);
  const baseDate = addMonths(todayStr(), monthOffset);
  const monthKey = getMonthKey(baseDate);
  const isCurrentMonth = monthOffset===0;
  const d = new Date(baseDate);
  const year = d.getFullYear();
  const month = d.getMonth();
  const daysInMonth = new Date(year, month+1, 0).getDate();

  const saveGoal=g=>{
    setData(dt=>{
      const list=[...(dt.goalItems||[])];
      const idx=list.findIndex(x=>x.id===g.id);
      if(idx>=0) list[idx]=g; else list.push(g);
      return {...dt,goalItems:list};
    });
  };
  const setGoalStatus=(id,status)=>{
    setData(dt=>({...dt,goalItems:(dt.goalItems||[]).map(g=>g.id===id?{...g,status}:g)}));
  };
  const deleteGoal=id=>{
    setData(dt=>({...dt,goalItems:(dt.goalItems||[]).filter(g=>g.id!==id)}));
  };

  // 이 달에 걸친 모든 ISO 주차 키를 날짜 순서대로 모으기 (중복 제거, 순서 유지)
  const weekKeysInMonth=[];
  for(let dayNum=1; dayNum<=daysInMonth; dayNum++){
    const ds=`${year}-${String(month+1).padStart(2,"0")}-${String(dayNum).padStart(2,"0")}`;
    const wk=getWeekKey(ds);
    if(!weekKeysInMonth.some(w=>w.key===wk)) weekKeysInMonth.push({key:wk, sampleDate:ds});
  }

  const monthGoals=(data.goalItems||[]).filter(g=>g.scope==="month"&&g.scopeKey===monthKey);
  const monthDone=monthGoals.filter(g=>g.status==="done").length;

  const MONTH_KO=["1월","2월","3월","4월","5월","6월","7월","8월","9월","10월","11월","12월"];

  return (
    <div>
      {/* 월 이동 네비게이터 */}
      <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:14,marginBottom:"1.3rem"}}>
        <button onClick={()=>setMonthOffset(o=>o-1)} style={{background:"#0a0c12",border:"1px solid #1e2230",borderRadius:8,color:"#9ca3af",cursor:"pointer",fontSize:"1.1rem",padding:"0.3rem 0.8rem"}}>‹</button>
        <div style={{textAlign:"center"}}>
          <div style={{color:"#f1f3f9",fontSize:"1.05rem",fontWeight:900}}>{year}년 {MONTH_KO[month]}</div>
          {!isCurrentMonth && <div onClick={()=>setMonthOffset(0)} style={{color:"#6366f1",fontSize:"0.68rem",cursor:"pointer",textDecoration:"underline",marginTop:2}}>이번 달로</div>}
        </div>
        <button onClick={()=>setMonthOffset(o=>o+1)} style={{background:"#0a0c12",border:"1px solid #1e2230",borderRadius:8,color:"#9ca3af",cursor:"pointer",fontSize:"1.1rem",padding:"0.3rem 0.8rem"}}>›</button>
      </div>

      {/* 이 달의 월간 목표 */}
      <div style={{background:"#f59e0b10",border:"1px solid #f59e0b35",borderRadius:14,padding:"1.1rem",marginBottom:"1.3rem"}}>
        <MonthGoalBlock monthKey={monthKey} goals={monthGoals} onSave={saveGoal} onStatus={setGoalStatus} onDelete={deleteGoal}/>
      </div>

      {/* 이 달에 걸친 주차별 목표 카드들 */}
      <div style={{color:"#6b7280",fontSize:"0.72rem",marginBottom:8,paddingLeft:2}}>
        이 달의 주간 목표 ({weekKeysInMonth.length}주)
      </div>
      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {weekKeysInMonth.map(({key,sampleDate},i)=>(
          <WeekGoalCard key={key} weekKey={key} sampleDate={sampleDate} weekIndex={i+1}
            goals={(data.goalItems||[]).filter(g=>g.scope==="week"&&g.scopeKey===key)}
            onSave={saveGoal} onStatus={setGoalStatus} onDelete={deleteGoal}/>
        ))}
      </div>
    </div>
  );
}

function MonthGoalBlock({monthKey, goals, onSave, onStatus, onDelete}) {
  const [modalOpen,setModalOpen]=useState(false);
  const [editGoal,setEditGoal]=useState(null);
  const done=goals.filter(g=>g.status==="done").length;
  return (
    <div>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:10}}>
        <span style={{color:"#f59e0b",fontSize:"0.85rem",fontWeight:900}}>🏁 이 달의 목표</span>
        {goals.length>0&&<span style={{color:"#d97706",fontSize:"0.72rem",fontFamily:"'JetBrains Mono',monospace",fontWeight:700}}>{done}/{goals.length}</span>}
        <div style={{flex:1}}/>
        <button onClick={()=>{setEditGoal(null);setModalOpen(true);}} style={{background:"#f59e0b20",border:"1px solid #f59e0b40",borderRadius:7,color:"#fbbf24",cursor:"pointer",fontSize:"0.74rem",fontWeight:700,padding:"0.25rem 0.65rem"}}>+ 목표 추가</button>
      </div>
      {goals.length===0
        ? <div style={{color:"#78716c",fontSize:"0.78rem"}}>이 달의 목표가 아직 없어. 위 버튼으로 세워봐.</div>
        : <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {goals.map(g=><GoalCard key={g.id} goal={g} onStatus={onStatus} onEdit={g=>{setEditGoal(g);setModalOpen(true);}} onDelete={onDelete}/>)}
          </div>
      }
      {modalOpen && (
        <GoalForm editData={editGoal} scope="month" scopeKey={monthKey}
          onSave={g=>{onSave(g);setModalOpen(false);setEditGoal(null);}}
          onClose={()=>{setModalOpen(false);setEditGoal(null);}}/>
      )}
    </div>
  );
}

function WeekGoalCard({weekKey, sampleDate, weekIndex, goals, onSave, onStatus, onDelete}) {
  const [open,setOpen]=useState(true);
  const [modalOpen,setModalOpen]=useState(false);
  const [editGoal,setEditGoal]=useState(null);
  const done=goals.filter(g=>g.status==="done").length;
  const label=weekRangeLabel(sampleDate);
  const isCurrentWeek = getWeekKey(todayStr())===weekKey;

  return (
    <div style={{background:"#0a0c12",border:`1px solid ${isCurrentWeek?"#6366f150":"#1e2230"}`,borderRadius:12,overflow:"hidden"}}>
      <div onClick={()=>setOpen(o=>!o)} style={{padding:"0.7rem 0.9rem",cursor:"pointer",display:"flex",alignItems:"center",gap:8}}>
        <span style={{color:isCurrentWeek?"#818cf8":"#6b7280",fontSize:"0.68rem",fontFamily:"'JetBrains Mono',monospace",fontWeight:700,flexShrink:0}}>{weekIndex}주차</span>
        <span style={{color:"#9ca3af",fontSize:"0.74rem"}}>{label}</span>
        {isCurrentWeek&&<span style={{background:"#6366f120",color:"#818cf8",fontSize:"0.62rem",padding:"0.08rem 0.4rem",borderRadius:99,fontWeight:700}}>이번 주</span>}
        {goals.length>0&&<span style={{color:"#4b5563",fontSize:"0.68rem",fontFamily:"'JetBrains Mono',monospace"}}>({done}/{goals.length})</span>}
        <div style={{flex:1}}/>
        <button onClick={e=>{e.stopPropagation();setEditGoal(null);setModalOpen(true);setOpen(true);}} style={{background:"none",border:"none",color:"#6366f1",cursor:"pointer",fontSize:"0.7rem",fontWeight:700}}>+ 추가</button>
        <span style={{color:"#4b5563",fontSize:"0.68rem"}}>{open?"▲":"▼"}</span>
      </div>
      {open&&(
        <div style={{padding:"0 0.9rem 0.85rem",borderTop:"1px solid #14161f"}}>
          {goals.length===0
            ? <div style={{color:"#4b5563",fontSize:"0.75rem",paddingTop:8}}>목표 없음</div>
            : <div style={{display:"flex",flexDirection:"column",gap:5,paddingTop:8}}>
                {goals.map(g=><GoalCard key={g.id} goal={g} onStatus={onStatus} onEdit={g=>{setEditGoal(g);setModalOpen(true);}} onDelete={onDelete}/>)}
              </div>
          }
        </div>
      )}
      {modalOpen && (
        <GoalForm editData={editGoal} scope="week" scopeKey={weekKey}
          onSave={g=>{onSave(g);setModalOpen(false);setEditGoal(null);}}
          onClose={()=>{setModalOpen(false);setEditGoal(null);}}/>
      )}
    </div>
  );
}

// ── 스케줄 뷰 (타임테이블 + 계획 동시) ──────────────────────────────────────────
// ── 밤 마무리 한줄 (매일 밤 쓰는 전용 메모, 취소/수정 가능) ────────────────────────
function NightNoteCard({date, note, onSave, onDelete}) {
  const [editing,setEditing]=useState(false);
  const [text,setText]=useState(note||"");

  useEffect(()=>{ setText(note||""); },[note]);

  function commit(){
    const trimmed=text.trim();
    if(!trimmed){ setEditing(false); return; }
    onSave(trimmed);
    setEditing(false);
  }
  function cancel(){
    setText(note||"");
    setEditing(false);
  }

  const hasNote = !!(note&&note.trim());

  return (
    <div style={{
      background:"#f59e0b0c", border:"1px solid #f59e0b30", borderRadius:11,
      padding:"0.8rem 1rem", marginTop:12
    }}>
      <div style={{display:"flex",alignItems:"center",gap:8,marginBottom: (editing||hasNote) ? 7 : 0}}>
        <span style={{color:"#f59e0b",fontSize:"0.75rem",fontWeight:800}}>🌙 오늘 밤 마무리 한줄</span>
        {!editing && (
          <button onClick={()=>setEditing(true)} style={{background:"none",border:"none",color:"#f59e0b",cursor:"pointer",fontSize:"0.72rem",marginLeft:"auto"}}>
            {hasNote?"수정":"+ 쓰기"}
          </button>
        )}
        {hasNote && !editing && (
          <button onClick={onDelete} style={{background:"none",border:"none",color:"#4b5563",cursor:"pointer",fontSize:"0.7rem"}}>삭제</button>
        )}
      </div>

      {editing ? (
        <div>
          <input autoFocus value={text} onChange={e=>setText(e.target.value)}
            onKeyDown={e=>{ if(e.key==="Enter") commit(); if(e.key==="Escape") cancel(); }}
            style={{...inp, marginBottom:8}} placeholder="오늘 하루 한 줄로 정리하면?"/>
          <div style={{display:"flex",gap:6}}>
            <button onClick={commit} style={{flex:1,padding:"0.4rem",borderRadius:7,border:"none",background:"#f59e0b",color:"white",fontSize:"0.76rem",fontWeight:700,cursor:"pointer"}}>저장</button>
            <button onClick={cancel} style={{flex:1,padding:"0.4rem",borderRadius:7,border:"1px solid #2a2d3a",background:"transparent",color:"#6b7280",fontSize:"0.76rem",cursor:"pointer"}}>취소</button>
          </div>
        </div>
      ) : hasNote ? (
        <div onClick={()=>setEditing(true)} style={{color:"#d1d5db",fontSize:"0.82rem",cursor:"pointer",lineHeight:1.6}}>{note}</div>
      ) : null}
    </div>
  );
}

// ── 스케줄 뷰 (타임테이블 + 계획 동시) ──────────────────────────────────────────
function ScheduleView({data,setData,initDate,activeTimer,onStartTimer,onStopTimer}) {
  const [date,setDate]=useState(initDate||studyDayStr());
  const [paintSubject,setPaintSubject]=useState("수학");
  const [erasing,setErasing]=useState(false);
  const [dragging,setDragging]=useState(false);
  const [planModal,setPlanModal]=useState(null);
  const [editPlan,setEditPlan]=useState(null);
  const [planView,setPlanView]=useState("day"); // day | week | month
  const [batchReviewOpen,setBatchReviewOpen]=useState(false);

  const hours=Array.from({length:TOTAL_HOURS},(_,i)=>(START_HOUR+i)%24);
  const daySlots=data.timetable[date]||{};
  const totalMins=calcMinutes(daySlots);
  const subMins=calcSubjectMinutes(daySlots);
  const dayPlans=(data.plans2||[]).filter(p=>p.date===date&&p.status!=="deletedLog").sort((a,b)=>a.subject.localeCompare(b.subject));
  const batchEligiblePlans=dayPlans.filter(p=>p.status!=="done");

  function paint(si){
    setData(d=>{const tt={...d.timetable};const day={...(tt[date]||{})};
      if(erasing)delete day[si]; else day[si]=paintSubject;
      tt[date]=day;return {...d,timetable:tt};});
  }
  function handleDown(si){setDragging(true);paint(si);}
  function handleEnter(si){if(dragging)paint(si);}
  function handleUp(){setDragging(false);}
  function clearDay(){if(!confirm("이 날 타임테이블 초기화?"))return;
    setData(d=>{const tt={...d.timetable};delete tt[date];return {...d,timetable:tt};});}

  function savePlan(p){
    setData(d=>{const list=[...(d.plans2||[])];
      const idx=list.findIndex(x=>x.id===p.id);
      if(idx>=0)list[idx]=p; else list.push(p);
      return {...d,plans2:list};});
  }
  function deletePlan(id,deleteReason){
    if(activeTimer?.planId===id){ alert("실행 중인 계획은 타이머를 먼저 정지해줘."); return; }
    setData(d=>{
      const list=[...(d.plans2||[])];
      const idx=list.findIndex(p=>p.id===id);
      if(idx<0)return d;
      const plan=list[idx];
      const deletedAt=Date.now();
      const log={
        id:`__deleted__${String(plan.id)}__${deletedAt}__${makeRandomId()}`,
        status:"deletedLog",
        date:"0000-00-00", // 구버전 UI에서도 일반 계획으로 노출되지 않게 숨김
        originalDate:plan.date,
        originalPlanId:plan.id,
        rootId:plan.rootId||plan.id,
        subject:plan.subject,
        content:plan.content,
        previousStatus:plan.status,
        deleteReason:deleteReason||"OTHER",
        deletedAt,
      };
      list.splice(idx,1); // 원본은 진짜 삭제 → 동기화 엔진이 tombstone 생성
      list.push(log);     // 삭제 이유는 별도 로그 item으로 안전하게 보존
      return {...d,plans2:list};
    });
  }
  function setStatus(id,status,failReason){
    setData(d=>{
      const list=[...(d.plans2||[])];
      const idx=list.findIndex(x=>x.id===id);if(idx<0)return d;
      const plan={...list[idx],status};
      if(status==="failed"&&failReason) plan.failReason=failReason;
      list[idx]=plan;
      if(status==="failed"){
        const tom=nextDay(plan.date);
        if(!list.some(p=>p.id===plan.id+"_m_"+tom)){
          // 이월본은 "내일 다시 할 계획"일 뿐, 오늘 이미 기록된 공부시간·실패사유까지 복사하면 안 됨
          // rootId는 최초 원본을 계속 이어받아서, 며칠 연속 실패해도 "같은 계획의 반복 시도"로 추적 가능
          const { totalMinutes, sessions, failReason:_fr, ...rest } = plan;
          const rootId = plan.rootId || plan.id;
          list.push({...rest,id:plan.id+"_m_"+tom,date:tom,status:"todo",rootId,note:"[이월] "+plan.content.slice(0,30)});
        }
      }
      return {...d,plans2:list};});
  }

  function applyBatchPlanAction(ids,mode,reason){
    const idSet=new Set(ids.map(String));
    if(activeTimer&&idSet.has(String(activeTimer.planId))){ alert("실행 중인 계획이 포함돼 있어. 타이머를 먼저 정지한 뒤 다시 해줘."); return; }
    setData(d=>{
      const list=[...(d.plans2||[])];
      for(const idStr of idSet){
        const idx=list.findIndex(p=>String(p.id)===idStr);
        if(idx<0)continue;
        const original=list[idx];
        if(original.status==="done"||original.status==="deletedLog")continue;
        if(mode==="deleted"){
          const deletedAt=Date.now();
          const log={
            id:`__deleted__${String(original.id)}__${deletedAt}__${makeRandomId()}`,
            status:"deletedLog",
            date:"0000-00-00",
            originalDate:original.date,
            originalPlanId:original.id,
            rootId:original.rootId||original.id,
            subject:original.subject,
            content:original.content,
            previousStatus:original.status,
            deleteReason:reason||"OTHER",
            deletedAt,
          };
          list.splice(idx,1);
          list.push(log);
          continue;
        }
        const plan={...original,status:"failed",failReason:reason};
        list[idx]=plan;
        const tom=nextDay(plan.date);
        if(!list.some(p=>p.id===plan.id+"_m_"+tom)){
          const {totalMinutes,sessions,failReason:_fr,deleteReason:_dr,deletedAt:_da,previousStatus:_ps,...rest}=plan;
          const rootId=plan.rootId||plan.id;
          list.push({...rest,id:plan.id+"_m_"+tom,date:tom,status:"todo",rootId,note:"[이월] "+plan.content.slice(0,30)});
        }
      }
      return {...d,plans2:list};
    });
  }

  // 세션(공부 시간 구간) 수동 수정 — 계획의 totalMinutes 재계산 + 그 계획이
  // 칠했던 타임테이블 슬롯을 전부 지우고 새 세션 시각 기준으로 다시 칠함
  function editSessions(planId, newSessions){
    setData(d=>{
      const plans=[...(d.plans2||[])];
      const idx=plans.findIndex(p=>p.id===planId);
      if(idx<0)return d;
      const plan=plans[idx];
      const oldSessions=plan.sessions||[];
      const totalMinutes=newSessions.reduce((a,s)=>a+s.minutes,0);
      plans[idx]={...plan, sessions:newSessions, totalMinutes};

      // 옛 세션들이 칠했던 슬롯 지우기 (이 계획 과목으로 칠해진 것만, 다른 계획 것은 건드리지 않음)
      const tt={...d.timetable};
      function slotRangeOf(session){
        const start=new Date(session.startedAt);
        const studyDate=new Date(start);
        if(start.getHours()<START_HOUR) studyDate.setDate(start.getDate()-1);
        const dateStr=`${studyDate.getFullYear()}-${String(studyDate.getMonth()+1).padStart(2,"0")}-${String(studyDate.getDate()).padStart(2,"0")}`;
        const startTotalMin=start.getHours()*60+start.getMinutes();
        const offset=((startTotalMin-START_HOUR*60)+1440)%1440;
        const startSlot=Math.floor(offset/10);
        const slotCount=Math.max(1,Math.round(session.minutes/10));
        return {dateStr,startSlot,slotCount};
      }
      oldSessions.forEach(s=>{
        const {dateStr,startSlot,slotCount}=slotRangeOf(s);
        if(!tt[dateStr])return;
        const day={...tt[dateStr]};
        for(let i=0;i<slotCount;i++){
          const si=(startSlot+i)%TOTAL_SLOTS;
          if(day[si]===plan.subject) delete day[si];
        }
        tt[dateStr]=day;
      });
      // 새 세션들로 다시 칠하기
      newSessions.forEach(s=>{
        const {dateStr,startSlot,slotCount}=slotRangeOf(s);
        const day={...(tt[dateStr]||{})};
        for(let i=0;i<slotCount;i++){
          const si=(startSlot+i)%TOTAL_SLOTS;
          day[si]=plan.subject;
        }
        tt[dateStr]=day;
      });

      return {...d, plans2:plans, timetable:tt};
    });
  }

  return (
    <div>
      {/* 날짜 + 컨트롤 */}
      <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:"1rem",flexWrap:"wrap"}}>
        <input type="date" value={date} onChange={e=>setDate(e.target.value)}
          style={{...inp,width:"auto",padding:"0.35rem 0.65rem",fontSize:"0.82rem"}}/>
        <div style={{display:"flex",gap:3,background:"#0a0c12",border:"1px solid #1e2230",borderRadius:8,padding:3}}>
          <button onClick={()=>setErasing(false)} style={{padding:"0.28rem 0.65rem",borderRadius:5,border:"none",cursor:"pointer",
            background:!erasing?"#6366f1":"transparent",color:!erasing?"white":"#4b5563",
            fontSize:"0.72rem",fontWeight:700}}>칠하기</button>
          <button onClick={()=>setErasing(true)} style={{padding:"0.28rem 0.65rem",borderRadius:5,border:"none",cursor:"pointer",
            background:erasing?"#ef4444":"transparent",color:erasing?"white":"#4b5563",
            fontSize:"0.72rem",fontWeight:700}}>지우기</button>
        </div>
        <Btn small outline color="#4b5563" onClick={clearDay}>초기화</Btn>
        <div style={{marginLeft:"auto"}}>
          <span style={{color:"#6366f1",fontSize:"0.9rem",fontWeight:800,fontFamily:"'JetBrains Mono',monospace"}}>{Math.floor(totalMins/60)}h {totalMins%60}m</span>
        </div>
      </div>

      {/* 과목 팔레트 */}
      <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:"1rem"}}>
        {SUBJECTS.map(sub=>{
          const c=SUBJECT_COLORS[sub];const mins=subMins[sub]||0;
          return <button key={sub} onClick={()=>{setPaintSubject(sub);setErasing(false);}} style={{
            padding:"0.25rem 0.65rem",borderRadius:7,
            border:`2px solid ${paintSubject===sub&&!erasing?c?.bg:"transparent"}`,
            background:c?.light,color:c?.text,
            fontSize:"0.72rem",fontWeight:700,cursor:"pointer",
            boxShadow:paintSubject===sub&&!erasing?`0 0 10px ${c?.bg}55`:undefined
          }}>{sub}{mins>0?" "+Math.floor(mins/60)+"h"+(mins%60?mins%60+"m":""):""}</button>;
        })}
      </div>

      {/* 메인: 타임테이블(왼쪽) + 계획(오른쪽), 모바일에선 세로 배치 */}
      <div className="schedule-grid" style={{display:"grid",gap:12,alignItems:"start"}}>

        {/* 타임테이블 */}
        <div style={{background:"#0a0c12",border:"1px solid #1e2230",borderRadius:12,overflow:"auto",userSelect:"none"}}
          onMouseLeave={handleUp} onMouseUp={handleUp} onTouchEnd={handleUp}>
          <div style={{display:"flex",flexDirection:"column",minWidth:36+SLOTS_PER_HOUR*36}}>
            {/* 분 헤더 */}
            <div style={{display:"flex",borderBottom:"2px solid #1e2230",background:"#0a0c12",position:"sticky",top:0,zIndex:5}}>
              <div style={{width:38,flexShrink:0}}/>
              {Array.from({length:SLOTS_PER_HOUR},(_,mi)=>(
                <div key={mi} style={{width:36,flexShrink:0,textAlign:"center",padding:"0.22rem 0",borderLeft:"1px solid #1e2230"}}>
                  <span style={{color:"#4b5563",fontSize:"0.55rem",fontFamily:"'JetBrains Mono',monospace"}}>:{String(mi*10).padStart(2,"0")}</span>
                </div>
              ))}
            </div>
            {/* 시간 행 */}
            {hours.map((h,hi)=>(
              <div key={h} style={{display:"flex",borderBottom:hi<hours.length-1?"1px solid #111318":"none"}}>
                <div style={{width:38,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",borderRight:"1px solid #1e2230",background:"#0a0c12"}}>
                  <span style={{color:"#4b5563",fontSize:"0.58rem",fontFamily:"'JetBrains Mono',monospace"}}>{String(h).padStart(2,"0")}시</span>
                </div>
                {Array.from({length:SLOTS_PER_HOUR},(_,mi)=>{
                  const si=hi*SLOTS_PER_HOUR+mi;
                  const sub=daySlots[si];
                  const c=sub?SUBJECT_COLORS[sub]:null;
                  return <div key={mi}
                    onMouseDown={()=>handleDown(si)} onMouseEnter={()=>handleEnter(si)}
                    onTouchStart={e=>{e.preventDefault();handleDown(si);}}
                    onTouchMove={e=>{e.preventDefault();const t=e.touches[0];const el=document.elementFromPoint(t.clientX,t.clientY);if(el?.dataset?.slot)handleEnter(Number(el.dataset.slot));}}
                    data-slot={si}
                    style={{width:36,height:28,flexShrink:0,cursor:"crosshair",
                      background:sub?c?.bg+"e0":"transparent",borderLeft:"1px solid #1a1d27",
                      position:"relative",transition:"background 0.04s"}}>
                    {sub&&mi===0&&<span style={{position:"absolute",left:1,top:1,fontSize:"0.5rem",color:"white",
                      pointerEvents:"none",whiteSpace:"nowrap",overflow:"hidden",maxWidth:32,opacity:0.9}}>{sub}</span>}
                  </div>;
                })}
              </div>
            ))}
          </div>
        </div>

        {/* 계획 패널 */}
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"0.6rem",flexWrap:"wrap",gap:6}}>
            <div style={{display:"flex",gap:3,background:"#0a0c12",border:"1px solid #1e2230",borderRadius:8,padding:3}}>
              {[["day","일간"],["week","주간"],["month","월간"]].map(([v,l])=>(
                <button key={v} onClick={()=>setPlanView(v)} style={{padding:"0.28rem 0.6rem",borderRadius:5,border:"none",cursor:"pointer",
                  background:planView===v?"#6366f1":"transparent",color:planView===v?"white":"#4b5563",
                  fontSize:"0.7rem",fontWeight:700}}>{l}</button>
              ))}
            </div>
            {planView==="day"&&<div style={{display:"flex",gap:5}}>
              <Btn small outline color="#f59e0b" disabled={batchEligiblePlans.length===0} onClick={()=>setBatchReviewOpen(true)}>🧹 일괄 정리 ({batchEligiblePlans.length})</Btn>
              <Btn small color="#6366f1" onClick={()=>{setEditPlan(null);setPlanModal("add");}}>+ 계획 추가</Btn>
            </div>}
          </div>

          {planView==="day"&&(
            <>
              <div style={{marginBottom:8}}>
                <span style={{color:"#9ca3af",fontSize:"0.76rem",fontWeight:700}}>
                  오늘 계획 <span style={{color:"#6366f1"}}>{dayPlans.length}개</span>
                  <span style={{color:"#22c55e",marginLeft:6}}>✅{dayPlans.filter(p=>p.status==="done").length}</span>
                  <span style={{color:"#ef4444",marginLeft:4}}>❌{dayPlans.filter(p=>p.status==="failed").length}</span>
                  {dayPlans.some(p=>p.status==="failed"&&!p.failReason)&&<span style={{color:"#f59e0b",marginLeft:5}}>사유 미분류 {dayPlans.filter(p=>p.status==="failed"&&!p.failReason).length}</span>}
                </span>
              </div>
              {dayPlans.length===0
                ?<div style={{color:"#2d3241",fontSize:"0.8rem",textAlign:"center",padding:"2rem 0"}}>계획 없음</div>
                :dayPlans.map(p=><PlanCard key={p.id} plan={p} onStatus={setStatus}
                    onEdit={p=>{setEditPlan(p);setPlanModal("edit");}} onDelete={deletePlan}
                    activeTimer={activeTimer} onStartTimer={onStartTimer} onStopTimer={onStopTimer}
                    onEditSessions={editSessions}/>)
              }
              <NightNoteCard date={date} note={(data.nightNotes||{})[date]}
                onSave={text=>setData(d=>({...d, nightNotes:{...(d.nightNotes||{}), [date]:text}}))}
                onDelete={()=>setData(d=>{ const nn={...(d.nightNotes||{})}; delete nn[date]; return {...d, nightNotes:nn}; })}/>
            </>
          )}

          {planView==="week"&&(()=>{
            const dt=new Date(date);
            const day=dt.getDay();
            const mon=new Date(dt); mon.setDate(dt.getDate()-(day===0?6:day-1));
            const weekDates=Array.from({length:7},(_,i)=>{const x=new Date(mon);x.setDate(mon.getDate()+i);return x.toISOString().slice(0,10);});
            const DAY_KO=["월","화","수","목","금","토","일"];
            const weekPlans=(data.plans2||[]).filter(p=>weekDates.includes(p.date)&&p.status!=="deletedLog");
            return (
              <div>
                <div style={{color:"#4b5563",fontSize:"0.72rem",marginBottom:8}}>
                  이번 주 계획 <span style={{color:"#6366f1",fontWeight:700}}>{weekPlans.length}개</span>
                  <span style={{color:"#22c55e",marginLeft:6}}>✅{weekPlans.filter(p=>p.status==="done").length}</span>
                  <span style={{color:"#ef4444",marginLeft:4}}>❌{weekPlans.filter(p=>p.status==="failed").length}</span>
                </div>
                {weekDates.map((wd,i)=>{
                  const wp=weekPlans.filter(p=>p.date===wd);
                  if(wp.length===0)return null;
                  return (
                    <div key={wd} style={{marginBottom:10}}>
                      <div onClick={()=>setDate(wd)} style={{cursor:"pointer",color:wd===todayStr()?"#6366f1":"#6b7280",fontSize:"0.72rem",fontFamily:"'JetBrains Mono',monospace",marginBottom:5}}>
                        {DAY_KO[i]} · {wd.slice(5)}
                      </div>
                      {wp.map(p=><PlanCard key={p.id} plan={p} onStatus={setStatus} onEdit={p=>{setEditPlan(p);setPlanModal("edit");}} onDelete={deletePlan}
                        activeTimer={activeTimer} onStartTimer={onStartTimer} onStopTimer={onStopTimer}
                        onEditSessions={editSessions}/>)}
                    </div>
                  );
                })}
                {weekPlans.length===0&&<div style={{color:"#2d3241",fontSize:"0.8rem",textAlign:"center",padding:"2rem 0"}}>이번 주 계획 없음</div>}
              </div>
            );
          })()}

          {planView==="month"&&(()=>{
            const ym=date.slice(0,7);
            const monthPlans=(data.plans2||[]).filter(p=>p.date.startsWith(ym)&&p.status!=="deletedLog");
            const bySubj={};
            for(const p of monthPlans){bySubj[p.subject]=(bySubj[p.subject]||0)+1;}
            const done=monthPlans.filter(p=>p.status==="done").length;
            const failed=monthPlans.filter(p=>p.status==="failed").length;
            const uniqueCount=new Set(monthPlans.map(resolvePlanRoot)).size;
            const rate=uniqueCount>0?Math.round((done/uniqueCount)*100):0;
            return (
              <div>
                <div style={{display:"flex",gap:14,flexWrap:"wrap",marginBottom:"1rem",background:"#0a0c12",border:"1px solid #1e2230",borderRadius:10,padding:"0.8rem"}}>
                  {[["고유 계획",uniqueCount,"#6b7280"],["완료",done,"#22c55e"],["실패",failed,"#ef4444"],["달성률",rate+"%","#f59e0b"]].map(([l,v,c])=>(
                    <div key={l} style={{textAlign:"center"}}>
                      <div style={{color:c,fontSize:"1.1rem",fontWeight:800,fontFamily:"'JetBrains Mono',monospace"}}>{v}</div>
                      <div style={{color:"#4b5563",fontSize:"0.62rem"}}>{l}</div>
                    </div>
                  ))}
                </div>
                {monthPlans.length!==uniqueCount&&(
                  <div style={{color:"#4b5563",fontSize:"0.66rem",marginBottom:"0.8rem"}}>(이월 포함 총 시도 {monthPlans.length}회)</div>
                )}
                <div style={{color:"#4b5563",fontSize:"0.7rem",marginBottom:8}}>과목별 계획 수</div>
                {Object.entries(bySubj).sort((a,b)=>b[1]-a[1]).map(([s,cnt])=>(
                  <div key={s} style={{display:"flex",justifyContent:"space-between",padding:"0.4rem 0",borderBottom:"1px solid #111318"}}>
                    <span style={{color:SUBJECT_COLORS[s]?.text||"#a5b4fc",fontSize:"0.8rem",fontWeight:700}}>{s}</span>
                    <span style={{color:"#4b5563",fontSize:"0.78rem",fontFamily:"'JetBrains Mono',monospace"}}>{cnt}개</span>
                  </div>
                ))}
                {monthPlans.length===0&&<div style={{color:"#2d3241",fontSize:"0.8rem",textAlign:"center",padding:"2rem 0"}}>이번 달 계획 없음</div>}
              </div>
            );
          })()}
        </div>
      </div>

      {batchReviewOpen&&(
        <BatchPlanReviewModal date={date} plans={dayPlans} onApply={applyBatchPlanAction} onClose={()=>setBatchReviewOpen(false)}/>
      )}

      {(planModal==="add"||planModal==="edit")&&(
        <PlanForm editData={planModal==="edit"?editPlan:null} defaultDate={date}
          onSave={p=>{savePlan(p);setPlanModal(null);setEditPlan(null);}}
          onClose={()=>{setPlanModal(null);setEditPlan(null);}}/>
      )}
    </div>
  );
}

// ── 달력 뷰 ──────────────────────────────────────────────────────────────────
function CalendarView({data,setData,onSelectDate}) {
  const [year,setYear]=useState(new Date().getFullYear());
  const [month,setMonth]=useState(new Date().getMonth());
  const [selectedDay,setSelectedDay]=useState(null); // 상세보기용, null이면 안 보임
  const today=todayStr();
  const MONTH_KO=["1월","2월","3월","4월","5월","6월","7월","8월","9월","10월","11월","12월"];
  const firstDay=new Date(year,month,1).getDay();
  const daysInMonth=new Date(year,month+1,0).getDate();
  const cells=[];
  for(let i=0;i<(firstDay===0?6:firstDay-1);i++)cells.push(null);
  for(let d=1;d<=daysInMonth;d++)cells.push(d);
  function ds(d){return `${year}-${String(month+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;}
  function prev(){if(month===0){setMonth(11);setYear(y=>y-1);}else setMonth(m=>m-1);setSelectedDay(null);}
  function next(){if(month===11){setMonth(0);setYear(y=>y+1);}else setMonth(m=>m+1);setSelectedDay(null);}

  const monthKey=`${year}-${String(month+1).padStart(2,"0")}`;
  const monthGoalItems=(data.goalItems||[]).filter(g=>g.scope==="month"&&g.scopeKey===monthKey);

  // 이번 달에 걸친 모든 주 목표 모으기 (달 1일~말일 각각의 주차 키를 모아 중복 제거)
  const weekKeysInMonth=[...new Set(Array.from({length:daysInMonth},(_,i)=>getWeekKey(ds(i+1))))];
  const weekGoalGroups=weekKeysInMonth.map(wk=>({
    key:wk,
    items:(data.goalItems||[]).filter(g=>g.scope==="week"&&g.scopeKey===wk)
  })).filter(g=>g.items.length>0);

  const selDateStr = selectedDay ? ds(selectedDay) : null;
  const selDayPlans = selDateStr ? (data.plans2||[]).filter(p=>p.date===selDateStr&&p.status!=="deletedLog") : [];

  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"1.1rem"}}>
        <button onClick={prev} style={{background:"none",border:"none",color:"#6b7280",cursor:"pointer",fontSize:"1.2rem",padding:"0.3rem 0.6rem"}}>‹</button>
        <span style={{color:"#f1f3f9",fontWeight:800,fontSize:"1rem"}}>{year}년 {MONTH_KO[month]}</span>
        <button onClick={next} style={{background:"none",border:"none",color:"#6b7280",cursor:"pointer",fontSize:"1.2rem",padding:"0.3rem 0.6rem"}}>›</button>
      </div>

      {/* 이번 달 월간 목표 요약 */}
      {monthGoalItems.length>0 && (
        <div style={{background:"#f59e0b12",border:"1px solid #f59e0b30",borderRadius:10,padding:"0.7rem 0.9rem",marginBottom:8}}>
          <div style={{color:"#f59e0b",fontSize:"0.68rem",fontWeight:800,marginBottom:6}}>
            🏁 이 달의 목표 ({monthGoalItems.filter(g=>g.status==="done").length}/{monthGoalItems.length})
          </div>
          {monthGoalItems.map(g=>(
            <div key={g.id} style={{display:"flex",alignItems:"center",gap:6,padding:"0.2rem 0",fontSize:"0.76rem"}}>
              <span style={{color:g.status==="done"?"#22c55e":"#4b5563"}}>{g.status==="done"?"✅":"○"}</span>
              <span style={{color:SUBJECT_COLORS[g.subject]?.text||"#a5b4fc",fontWeight:700}}>{g.subject}</span>
              <span style={{color:g.status==="done"?"#4b5563":"#d1d5db",textDecoration:g.status==="done"?"line-through":"none"}}>{g.content}</span>
            </div>
          ))}
        </div>
      )}

      {/* 이번 달에 걸친 주간 목표들 */}
      {weekGoalGroups.length>0 && (
        <div style={{background:"#6366f112",border:"1px solid #6366f130",borderRadius:10,padding:"0.7rem 0.9rem",marginBottom:12}}>
          <div style={{color:"#6366f1",fontSize:"0.68rem",fontWeight:800,marginBottom:6}}>🎯 이 달의 주간 목표들</div>
          {weekGoalGroups.map(({key,items})=>(
            <div key={key} style={{marginBottom:6}}>
              <div style={{color:"#6b7280",fontSize:"0.66rem",fontFamily:"'JetBrains Mono',monospace",marginBottom:2}}>{key} ({items.filter(g=>g.status==="done").length}/{items.length})</div>
              {items.map(g=>(
                <div key={g.id} style={{display:"flex",alignItems:"center",gap:6,padding:"0.15rem 0",fontSize:"0.75rem"}}>
                  <span style={{color:g.status==="done"?"#22c55e":"#4b5563"}}>{g.status==="done"?"✅":"○"}</span>
                  <span style={{color:SUBJECT_COLORS[g.subject]?.text||"#a5b4fc",fontWeight:700}}>{g.subject}</span>
                  <span style={{color:g.status==="done"?"#4b5563":"#d1d5db",textDecoration:g.status==="done"?"line-through":"none"}}>{g.content}</span>
                </div>
              ))}
            </div>
          ))}
        </div>
      )}

      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2,marginBottom:4}}>
        {["월","화","수","목","금","토","일"].map((d,i)=>(
          <div key={d} style={{textAlign:"center",color:i===5?"#8b5cf6":i===6?"#ef4444":"#4b5563",fontSize:"0.68rem",fontWeight:700,padding:"0.25rem 0"}}>{d}</div>
        ))}
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2}}>
        {cells.map((d,i)=>{
          if(!d)return <div key={"e"+i}/>;
          const dateStr=ds(d);
          const slots=data.timetable[dateStr]||{};
          const mins=calcMinutes(slots);
          const subMins=calcSubjectMinutes(slots);
          const topSub=Object.entries(subMins).sort((a,b)=>b[1]-a[1])[0]?.[0];
          const plans=(data.plans2||[]).filter(p=>p.date===dateStr&&p.status!=="deletedLog");
          const done=plans.filter(p=>p.status==="done").length;
          const failed=plans.filter(p=>p.status==="failed").length;
          const isToday=dateStr===today;
          const c=topSub?SUBJECT_COLORS[topSub]:null;
          return (
            <div key={d} onClick={()=>setSelectedDay(selectedDay===d?null:d)} style={{
              background:isToday?"#1a1d2e":selectedDay===d?"#171a26":"#0a0c12",
              border:`1px solid ${selectedDay===d?"#6366f1":isToday?"#6366f150":"#1e2230"}`,
              borderRadius:9,padding:"0.4rem 0.25rem",cursor:"pointer",
              minHeight:64,display:"flex",flexDirection:"column",alignItems:"center",gap:2
            }}>
              <span style={{color:isToday?"#6366f1":i%7===6?"#ef4444":i%7===5?"#8b5cf6":"#9ca3af",
                fontSize:"0.78rem",fontWeight:isToday?800:400,fontFamily:"'JetBrains Mono',monospace"}}>{d}</span>
              {mins>0&&<>
                <div style={{width:"80%",height:3,background:c?.bg||"#6366f1",borderRadius:99,opacity:0.8}}/>
                <span style={{color:c?.text||"#a5b4fc",fontSize:"0.6rem",fontFamily:"'JetBrains Mono',monospace",fontWeight:700}}>
                  {Math.floor(mins/60)}h{mins%60?mins%60+"m":""}
                </span>
              </>}
              {plans.length>0&&<div style={{fontSize:"0.58rem",lineHeight:1}}>
                {done>0&&<span style={{color:"#22c55e"}}>✅{done}</span>}
                {failed>0&&<span style={{color:"#ef4444"}}> ❌{failed}</span>}
                {plans.filter(p=>p.status==="todo").length>0&&<span style={{color:"#6366f1"}}> ·{plans.filter(p=>p.status==="todo").length}</span>}
              </div>}
            </div>
          );
        })}
      </div>

      {/* 선택된 날짜의 일간 계획 상세 */}
      {selectedDay && (
        <div style={{marginTop:10,background:"#0a0c12",border:"1px solid #1e2230",borderRadius:12,padding:"1rem"}}>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:8}}>
            <span style={{color:"#f1f3f9",fontWeight:800,fontSize:"0.85rem"}}>
              {selDateStr} {selDateStr===today?"(오늘)":""}
            </span>
            <button onClick={()=>onSelectDate(selDateStr)} style={{
              background:"#6366f120",border:"1px solid #6366f140",borderRadius:7,color:"#818cf8",
              cursor:"pointer",fontSize:"0.72rem",padding:"0.3rem 0.7rem",fontWeight:700
            }}>타임테이블 열기 →</button>
          </div>
          {selDayPlans.length===0
            ? <div style={{color:"#4b5563",fontSize:"0.78rem"}}>이 날 등록된 계획 없음</div>
            : selDayPlans.map(p=>{
                const c=SUBJECT_COLORS[p.subject];
                const statusColor = p.status==="done"?"#22c55e":p.status==="failed"?"#ef4444":"#6b7280";
                const statusLabel = p.status==="done"?"✅ 완료":p.status==="failed"?"❌ 실패":"○ 예정";
                return (
                  <div key={p.id} style={{display:"flex",alignItems:"center",gap:8,padding:"0.3rem 0",fontSize:"0.8rem"}}>
                    <span style={{color:statusColor,fontSize:"0.72rem",flexShrink:0}}>{statusLabel}</span>
                    <span style={{color:c?.text||"#a5b4fc",fontWeight:700,flexShrink:0}}>{p.subject}</span>
                    <span style={{color:p.status==="done"?"#4b5563":"#d1d5db",textDecoration:p.status==="done"?"line-through":"none"}}>{p.content}</span>
                  </div>
                );
              })
          }
        </div>
      )}

      {/* 월간 통계 */}
      <div style={{marginTop:"1.2rem",background:"#0a0c12",border:"1px solid #1e2230",borderRadius:12,padding:"1rem"}}>
        <div style={{color:"#4b5563",fontSize:"0.65rem",textTransform:"uppercase",letterSpacing:"0.07em",marginBottom:10}}>이번 달 누적</div>
        {(()=>{
          const monthSubMins={};
          for(let d=1;d<=daysInMonth;d++){
            const sm=calcSubjectMinutes(data.timetable[ds(d)]||{});
            for(const [s,m] of Object.entries(sm))monthSubMins[s]=(monthSubMins[s]||0)+m;
          }
          const total=Object.values(monthSubMins).reduce((a,b)=>a+b,0)||1;
          const sorted=Object.entries(monthSubMins).sort((a,b)=>b[1]-a[1]);
          const mp=(data.plans2||[]).filter(p=>p.date.startsWith(year+"-"+String(month+1).padStart(2,"0"))&&p.status!=="deletedLog");
          const rate=mp.length>0?Math.round((mp.filter(p=>p.status==="done").length/mp.length)*100):null;
          return <>
            {sorted.slice(0,5).map(([sub,m])=>{
              const c=SUBJECT_COLORS[sub];
              return <div key={sub} style={{marginBottom:7}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:2}}>
                  <span style={{color:c?.text,fontSize:"0.75rem",fontWeight:700}}>{sub}</span>
                  <span style={{color:"#4b5563",fontSize:"0.68rem",fontFamily:"'JetBrains Mono',monospace"}}>{Math.floor(m/60)}h {m%60}m</span>
                </div>
                <div style={{height:4,background:"#111318",borderRadius:99,overflow:"hidden"}}>
                  <div style={{height:"100%",width:`${(m/total)*100}%`,background:c?.bg,borderRadius:99}}/>
                </div>
              </div>;
            })}
            {rate!==null&&<div style={{marginTop:8,color:"#f59e0b",fontSize:"0.75rem",fontWeight:700}}>계획 달성률 {rate}%</div>}
          </>;
        })()}
      </div>
    </div>
  );
}


// ── 계획 외 공부 타이머 ────────────────────────────────────────────────────────
function AdhocStudyTimerModal({onStart,onClose,activeTimer}) {
  const [subject,setSubject]=useState("수학");
  const [content,setContent]=useState("");
  const blocked=!!activeTimer;
  return (
    <Modal title="▶ 계획 외 공부 시작" onClose={onClose}>
      <div style={{color:"#9ca3af",fontSize:"0.78rem",lineHeight:1.6,marginBottom:"1rem"}}>
        오늘 계획에 없던 공부도 바로 타이머를 켤 수 있어. 정지하면 기존 타이머와 똑같이 타임테이블에 자동 기록돼.
      </div>
      <div style={{marginBottom:"0.9rem"}}>
        <Lbl>과목</Lbl>
        <select value={subject} onChange={e=>setSubject(e.target.value)} style={inp}>
          {SUBJECTS.map(s=><option key={s} value={s}>{s}</option>)}
        </select>
      </div>
      <div style={{marginBottom:"1rem"}}>
        <Lbl>무슨 공부인지 (선택)</Lbl>
        <input value={content} onChange={e=>setContent(e.target.value)} style={inp} placeholder="예: 수학 오답 복습, 영어 단어 30분"/>
      </div>
      {blocked&&<div style={{color:"#ef4444",fontSize:"0.75rem",marginBottom:"0.8rem"}}>이미 다른 타이머가 실행 중이야. 먼저 기존 타이머를 정지해줘.</div>}
      <Btn full disabled={blocked} onClick={()=>{
        if(blocked)return;
        onStart(subject,content.trim()||"계획 외 공부");
        onClose();
      }}>▶ 계획 외 공부 시작</Btn>
    </Modal>
  );
}

// ── 메인 ──────────────────────────────────────────────────────────────────────
export default function App() {
  // 화면 state와 저장 state를 분리한다. UI에서 일어나는 모든 setData는 아래 래퍼를 통해
  // 항목별 버전/tombstone을 자동 기록한다. 서버/다른 탭에서 병합된 데이터만 setDataRaw를 쓴다.
  const [data,setDataRaw]=useState(()=>ensureSyncMeta(loadFallback(),"local"));
  const dataRef=useRef(data);
  dataRef.current=data;
  const setData=useCallback((update)=>{
    setDataRaw(prev=>{
      const next=typeof update==="function" ? update(prev) : update;
      return stampLocalChanges(prev,next);
    });
  },[]);

  const [tab,setTab]=useState("schedule");
  const [modal,setModal]=useState(null);
  const [editWrong,setEditWrong]=useState(null);
  const [scheduleDate,setScheduleDate]=useState(studyDayStr());
  const [practiceQueue,setPracticeQueue]=useState(null); // array of wrong entries with photo
  const [syncStatus,setSyncStatus]=useState("idle"); // idle | syncing | synced | error | offline
  const cloudTimerRef=useRef(null);
  const initialSyncDone=useRef(false);
  const syncInFlightRef=useRef(null);
  const syncRequestedRef=useRef(false);
  const broadcastRef=useRef(null);

  // ── 계획 실행 타이머 (전역: 탭 이동/새로고침/백그라운드에도 유지) ────────────────
  const TIMER_KEY = "studyos_active_timer";
  const [activeTimer,setActiveTimerRaw]=useState(()=>{
    try { const r=localStorage.getItem(TIMER_KEY); return r?JSON.parse(r):null; } catch { return null; }
  });
  const [timerTick,setTimerTick]=useState(0); // 화면 숫자 갱신용 더미 state

  function setActiveTimer(v){
    setActiveTimerRaw(v);
    try {
      if (v) localStorage.setItem(TIMER_KEY, JSON.stringify(v));
      else localStorage.removeItem(TIMER_KEY);
    } catch {}
  }

  // 1초 간격 갱신 + 탭이 백그라운드에서 돌아왔을 때(visibilitychange) 즉시 갱신
  // (setInterval은 백그라운드 탭에서 브라우저가 느리게 만들지만, Date.now() 기반 계산이라
  //  실제 경과 시간은 항상 정확함 — 화면 숫자만 잠깐 안 움직이다가 복귀 시 바로 맞춰짐)
  useEffect(()=>{
    if(!activeTimer) return;
    const iv=setInterval(()=>setTimerTick(t=>t+1),1000);
    function onVisible(){ if(document.visibilityState==="visible") setTimerTick(t=>t+1); }
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return ()=>{
      clearInterval(iv);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  },[activeTimer]);

  function startTimer(plan){
    setActiveTimer({planId:plan.id, subject:plan.subject, content:plan.content, startedAt:Date.now(), date:plan.date, adhoc:false});
  }
  function startAdhocTimer(subject,content){
    if(activeTimer) return;
    setActiveTimer({
      planId:null,
      adhoc:true,
      subject,
      content:content||"계획 외 공부",
      startedAt:Date.now(),
      date:studyDayStr(),
    });
  }
  function stopTimer(){
    if(!activeTimer) return;
    const elapsedMs = Date.now()-activeTimer.startedAt;
    const elapsedMin = Math.round(elapsedMs/60000);
    if(elapsedMin>=1){
      // 타이머 시작 시각부터 elapsedMin 분만큼 10분 슬롯을 자동으로 채움
      const startDate = new Date(activeTimer.startedAt);
      // 학습일 기준: 새벽 6시 이전 시작이면 전날 학습으로 귀속
      const studyDate = new Date(startDate);
      if (startDate.getHours() < START_HOUR) studyDate.setDate(startDate.getDate()-1);
      const dateStr = `${studyDate.getFullYear()}-${String(studyDate.getMonth()+1).padStart(2,"0")}-${String(studyDate.getDate()).padStart(2,"0")}`;
      const startTotalMin = startDate.getHours()*60+startDate.getMinutes();
      const startOffsetFromWindow = ((startTotalMin - START_HOUR*60)+1440)%1440; // 06:00 기준 오프셋(분)
      const startSlot = Math.floor(startOffsetFromWindow/10);
      const slotCount = Math.max(1, Math.round(elapsedMin/10));
      setData(d=>{
        const tt={...d.timetable};
        const day={...(tt[dateStr]||{})};
        for(let i=0;i<slotCount;i++){
          const si=(startSlot+i)%TOTAL_SLOTS;
          day[si]=activeTimer.subject;
        }
        tt[dateStr]=day;
        // 계획 타이머라면 해당 계획에 실행 시간을 누적한다.
        // 계획 외 공부(adhoc)는 타임테이블에만 기록해서 기존 계획 데이터에는 손대지 않는다.
        const plans=activeTimer.planId==null ? (d.plans2||[]) : (d.plans2||[]).map(p=>{
          if(p.id!==activeTimer.planId) return p;
          const sessions=[...(p.sessions||[]), { date:dateStr, minutes:elapsedMin, startedAt:activeTimer.startedAt, endedAt:Date.now() }];
          return { ...p, totalMinutes:(p.totalMinutes||0)+elapsedMin, sessions };
        });
        return {...d, timetable:tt, plans2:plans};
      });
    }
    setActiveTimer(null);
  }
  function timerElapsedLabel(){
    if(!activeTimer) return "";
    const sec=Math.floor((Date.now()-activeTimer.startedAt)/1000);
    const h=Math.floor(sec/3600), m=Math.floor((sec%3600)/60), s=sec%60;
    return h>0 ? `${h}:${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}` : `${m}:${String(s).padStart(2,"0")}`;
  }

  // ── 안전 동기화 엔진 ────────────────────────────────────────────────────────
  // 한 번에 cloud sync는 하나만 실행한다. 실행 중 또 요청되면 끝난 뒤 한 번 더 돌린다.
  // 따라서 오래 걸린 이전 요청이 나중 요청을 뒤늦게 덮어쓰는 race가 없다.
  const syncNow=useCallback(async()=>{
    if(typeof navigator!=="undefined" && navigator.onLine===false){
      setSyncStatus("offline");
      return {ok:false,reason:"offline"};
    }
    if(syncInFlightRef.current){
      syncRequestedRef.current=true;
      return syncInFlightRef.current;
    }

    const task=(async()=>{
      let last={ok:true};
      do{
        syncRequestedRef.current=false;
        setSyncStatus("syncing");

        // 현재 메모리 + 다른 탭이 이미 IDB에 쓴 최신본을 먼저 안전 병합한다.
        let local=await readDurableLocal();
        local=mergeSyncData(local,dataRef.current);
        local=await persistLocalMerged(local);

        const result=await syncDurableWithCloud(local);
        last=result;

        // sync 도중 사용자가 새로 수정했어도 persistLocalMerged가 항목별 버전을 비교하므로
        // 방금 수정한 데이터가 과거 cloud 결과에 의해 사라지지 않는다.
        const finalLocal=await persistLocalMerged(result.data||local);
        if(!sameSnapshot(finalLocal,dataRef.current)) setDataRaw(finalLocal);

        if(!result.ok){
          setSyncStatus((typeof navigator!=="undefined"&&navigator.onLine===false)?"offline":"error");
          return result;
        }
        setSyncStatus("synced");
      }while(syncRequestedRef.current && (typeof navigator==="undefined" || navigator.onLine!==false));
      return last;
    })();

    syncInFlightRef.current=task;
    try { return await task; }
    finally { syncInFlightRef.current=null; }
  },[]);

  // 1) 앱 시작: IndexedDB가 로컬 원본. localStorage는 사진 없는 비상용 fallback.
  //    서버 응답이 늦게 와도 setData로 통째로 교체하지 않고 항상 병합한다.
  useEffect(()=>{
    let cancelled=false;
    (async()=>{
      let local=await readDurableLocal();
      local=await persistLocalMerged(mergeSyncData(local,dataRef.current));
      if(cancelled) return;
      if(!sameSnapshot(local,dataRef.current)) setDataRaw(local);

      initialSyncDone.current=true;
      if(typeof navigator!=="undefined" && navigator.onLine===false){
        setSyncStatus("offline");
        return;
      }
      await syncNow();
    })();
    return ()=>{ cancelled=true; };
  },[syncNow]);

  // 2) 모든 수정은 로컬에 먼저 저장한다.
  //    localStorage 경량본은 동기식으로 먼저 쓰고, 사진 포함 원본은 IndexedDB에 이어서 저장한다.
  //    따라서 cloud 실패/오프라인과 로컬 저장이 완전히 분리된다.
  useEffect(()=>{
    let alive=true;
    saveFallback(data);
    (async()=>{
      const persisted=await persistLocalMerged(data);
      if(!alive) return;
      if(!sameSnapshot(persisted,dataRef.current)){
        setDataRaw(persisted);
        return;
      }
      try { broadcastRef.current?.postMessage({type:"changed",source:SESSION_ID}); } catch {}
    })();

    if(!initialSyncDone.current) return ()=>{ alive=false; };
    if(typeof navigator!=="undefined" && navigator.onLine===false){
      setSyncStatus("offline");
      return ()=>{ alive=false; };
    }

    if(cloudTimerRef.current) clearTimeout(cloudTimerRef.current);
    cloudTimerRef.current=setTimeout(()=>{ syncNow(); },900);
    return ()=>{
      alive=false;
      if(cloudTimerRef.current) clearTimeout(cloudTimerRef.current);
    };
  },[data,syncNow]);

  // 브라우저가 백그라운드/종료로 넘어갈 때 마지막 로컬 상태를 한 번 더 보존한다.
  // cloud 쓰기는 unload 시도하지 않는다(불완전한 네트워크 요청으로 race를 만들지 않기 위해).
  useEffect(()=>{
    try { navigator.storage?.persist?.().catch(()=>{}); } catch {}
    const flushLocal=()=>{
      const snapshot=dataRef.current;
      saveFallback(snapshot);
      persistLocalMerged(snapshot).catch(()=>{});
    };
    const onVisibility=()=>{ if(document.visibilityState==="hidden") flushLocal(); };
    window.addEventListener("pagehide",flushLocal);
    document.addEventListener("visibilitychange",onVisibility);
    return ()=>{
      window.removeEventListener("pagehide",flushLocal);
      document.removeEventListener("visibilitychange",onVisibility);
    };
  },[]);

  // 3) 같은 브라우저에서 탭이 여러 개 열려도 서로 오래된 메모리 state로 덮어쓰지 않는다.
  //    BroadcastChannel은 데이터 자체를 보내지 않고 "IDB 다시 읽어" 신호만 보낸다.
  useEffect(()=>{
    let closed=false;
    let bc=null;
    async function pullLocal(){
      const latest=await readDurableLocal();
      if(closed) return;
      const merged=mergeSyncData(dataRef.current,latest);
      const persisted=await persistLocalMerged(merged);
      if(!sameSnapshot(persisted,dataRef.current)) setDataRaw(persisted);
    }

    if(typeof BroadcastChannel!=="undefined"){
      bc=new BroadcastChannel("studyos-sync-v3");
      broadcastRef.current=bc;
      bc.onmessage=e=>{
        if(e?.data?.source===SESSION_ID) return;
        if(e?.data?.type==="changed") pullLocal();
      };
    }
    function onStorage(e){ if(e.key===STORAGE_KEY) pullLocal(); }
    window.addEventListener("storage",onStorage);
    return ()=>{
      closed=true;
      window.removeEventListener("storage",onStorage);
      try { bc?.close(); } catch {}
      if(broadcastRef.current===bc) broadcastRef.current=null;
    };
  },[]);

  // 4) 네트워크 복귀 시 "현재 메모리를 그냥 업로드"하지 않는다.
  //    반드시 서버 최신본을 먼저 읽고 병합 + CAS 저장한다.
  useEffect(()=>{
    function handleOnline(){ if(initialSyncDone.current) syncNow(); }
    function handleOffline(){
      if(cloudTimerRef.current) clearTimeout(cloudTimerRef.current);
      setSyncStatus("offline");
    }
    function handleFocus(){
      if(initialSyncDone.current && (typeof navigator==="undefined" || navigator.onLine!==false)) syncNow();
    }
    function handleVisible(){ if(document.visibilityState==="visible") handleFocus(); }
    window.addEventListener("online",handleOnline);
    window.addEventListener("offline",handleOffline);
    window.addEventListener("focus",handleFocus);
    document.addEventListener("visibilitychange",handleVisible);
    return ()=>{
      window.removeEventListener("online",handleOnline);
      window.removeEventListener("offline",handleOffline);
      window.removeEventListener("focus",handleFocus);
      document.removeEventListener("visibilitychange",handleVisible);
    };
  },[syncNow]);

  const addWrong=w=>setData(d=>({...d,wrongs:[...d.wrongs,w]}));
  const updateWrong=w=>setData(d=>({...d,wrongs:d.wrongs.map(e=>e.id===w.id?w:e)}));
  const updateWrongCounts=(id,patch)=>setData(d=>({...d,wrongs:d.wrongs.map(e=>e.id===id?{...e,...patch}:e)}));
  const delWrong=id=>setData(d=>({...d,wrongs:d.wrongs.filter(e=>e.id!==id)}));
  const renameFolder=(key,name)=>setData(d=>({...d,folderNames:{...(d.folderNames||{}),[key]:name}}));

  function handlePracticeResult(entry, result, solved) {
    setData(d=>({
      ...d,
      wrongs: d.wrongs.map(w=>{
        if(w.id!==entry.id) return w;
        const streak = result==="correct" ? (w.correctStreak||0)+1 : 0;
        return {
          ...w,
          attemptCount: (w.attemptCount||0)+1,
          failCount: result==="wrong" ? (w.failCount||0)+1 : (w.failCount||0),
          correctStreak: streak,
          solved: solved ? true : w.solved,
          lastPracticed: todayStr(),
        };
      })
    }));
  }

  // 이번 주 통계
  const now=new Date();
  const weekStart=new Date(now);weekStart.setDate(now.getDate()-6);
  let weekMins=0;
  for(let d=new Date(weekStart);d<=now;d.setDate(d.getDate()+1)){
    const ds=d.toISOString().slice(0,10);
    weekMins+=calcMinutes(data.timetable[ds]||{});
  }
  const weekWrongs=data.wrongs.filter(w=>new Date(w.date)>=weekStart).length;

  const tabs=[
    {id:"schedule",label:"계획+타임테이블"},
    {id:"goals",label:"목표"},
    {id:"calendar",label:"달력"},
    {id:"wrongs",label:`오답 (${data.wrongs.length})`},
  ];

  return (
    <div style={{minHeight:"100vh",background:"#080910"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;800;900&family=JetBrains+Mono:wght@400;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;font-family:'Noto Sans KR',sans-serif;}
        .mono{font-family:'JetBrains Mono',monospace;}
        @keyframes pulse{0%,100%{opacity:0.3;transform:scale(0.8)}50%{opacity:1;transform:scale(1)}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        .fade{animation:fadeUp 0.3s ease forwards;}
        button{transition:opacity 0.12s;}button:hover{opacity:0.82;}
        ::-webkit-scrollbar{width:4px;}::-webkit-scrollbar-thumb{background:#1e2230;border-radius:2px;}
        input[type=date]::-webkit-calendar-picker-indicator{filter:invert(0.4);}
        .schedule-grid{grid-template-columns:1fr;}
        @media(min-width:720px){.schedule-grid{grid-template-columns:1.2fr 1fr;}}
      `}</style>

      {/* 헤더 */}
      <header style={{borderBottom:"1px solid #13151e",padding:"1rem 1.5rem",
        display:"flex",justifyContent:"space-between",alignItems:"center",
        position:"sticky",top:0,background:"rgba(8,9,16,0.97)",backdropFilter:"blur(16px)",zIndex:100}}>
        <div>
          <div style={{color:"#f1f3f9",fontSize:"1rem",fontWeight:900,fontFamily:"'JetBrains Mono',monospace",letterSpacing:"-0.02em"}}>
            STUDY<span style={{color:"#6366f1"}}>_OS</span>
          </div>
          <div style={{color:"#2d3241",fontSize:"0.62rem",marginTop:1,fontFamily:"'JetBrains Mono',monospace",display:"flex",alignItems:"center",gap:5}}>
            극상위권 학습 시스템
            <span style={{
              display:"inline-flex",alignItems:"center",gap:3,
              color:syncStatus==="syncing"?"#f59e0b":syncStatus==="error"?"#ef4444":syncStatus==="offline"?"#6b7280":"#22c55e"
            }}>
              <span style={{width:5,height:5,borderRadius:"50%",background:"currentColor",display:"inline-block"}}/>
              {syncStatus==="syncing"?"동기화 중":syncStatus==="error"?"동기화 실패 (F12 콘솔 확인)":syncStatus==="offline"?"오프라인 (로컬 저장 중)":"동기화됨"}
            </span>
            {syncStatus==="error"&&(
              <button onClick={()=>{ syncNow(); }} style={{background:"none",border:"1px solid #ef444450",borderRadius:5,color:"#ef4444",cursor:"pointer",fontSize:"0.6rem",padding:"0.05rem 0.4rem"}}>재시도</button>
            )}
          </div>
        </div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap",justifyContent:"flex-end"}}>
          <Btn small outline color="#22c55e" disabled={!!activeTimer} onClick={()=>setModal("adhocTimer")}>▶ 계획 외 공부</Btn>
          <Btn small color="#ef4444" onClick={()=>{setEditWrong(null);setModal("wrong");}}>오답 등록</Btn>
          <Btn small outline color="#4b5563" onClick={()=>setModal("backup")}>백업</Btn>
        </div>
      </header>

      {/* 실행 중인 타이머 바 — 어느 탭에 있든 항상 보임 */}
      {activeTimer&&(()=>{const _=timerTick; const c=SUBJECT_COLORS[activeTimer.subject]; return (
        <div style={{
          position:"sticky",top:64,zIndex:99,
          background:`${c?.bg||"#6366f1"}18`,borderBottom:`1px solid ${c?.bg||"#6366f1"}40`,
          padding:"0.6rem 1.2rem",display:"flex",alignItems:"center",gap:10,flexWrap:"wrap"
        }}>
          <span style={{width:8,height:8,borderRadius:"50%",background:c?.bg||"#6366f1",animation:"pulse 1.5s infinite",flexShrink:0}}/>
          <span style={{color:c?.text||"#a5b4fc",fontWeight:800,fontSize:"0.82rem"}}>{activeTimer.subject}</span>
          {activeTimer.adhoc&&<span style={{background:"#22c55e18",border:"1px solid #22c55e40",color:"#22c55e",borderRadius:99,padding:"0.08rem 0.45rem",fontSize:"0.64rem",fontWeight:800}}>계획 외</span>}
          <span style={{color:"#9ca3af",fontSize:"0.8rem",flex:1,minWidth:0,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{activeTimer.content}</span>
          <span style={{color:c?.bg||"#6366f1",fontSize:"1rem",fontWeight:800,fontFamily:"'JetBrains Mono',monospace",flexShrink:0}}>{timerElapsedLabel()}</span>
          <button onClick={stopTimer} style={{
            background:"#ef4444",border:"none",borderRadius:8,color:"white",cursor:"pointer",
            fontSize:"0.78rem",fontWeight:700,padding:"0.35rem 0.9rem",flexShrink:0
          }}>■ 정지</button>
        </div>
      );})()}

      <main style={{maxWidth:900,margin:"0 auto",padding:"1.4rem 1rem"}}>

        {/* 리포트 내보내기 버튼 */}
        <div style={{display:"flex",gap:7,marginBottom:"1.2rem",flexWrap:"wrap"}}>
          <button onClick={()=>setModal("report")} style={{
            padding:"0.52rem 1.1rem",borderRadius:9,border:"none",
            background:"linear-gradient(135deg,#6366f1,#8b5cf6)",
            color:"white",fontWeight:700,fontSize:"0.8rem",cursor:"pointer",
            boxShadow:"0 3px 14px #6366f135"}}>📋 기간별 리포트 내보내기</button>
        </div>

        {/* 스탯 */}
        <div style={{display:"flex",gap:8,marginBottom:"1.2rem",flexWrap:"wrap"}}>
          {[
            ["이번 주",`${Math.floor(weekMins/60)}h ${weekMins%60}m`,"#6366f1"],
            ["주간 오답",`${weekWrongs}개`,"#ef4444"],
            ["총 오답",`${data.wrongs.length}개`,"#f59e0b"],
          ].map(([l,v,c])=>(
            <div key={l} style={{background:"#0a0c12",border:"1px solid #1e2230",borderRadius:11,padding:"0.8rem 1rem",flex:1,minWidth:100}}>
              <div style={{color:"#4b5563",fontSize:"0.62rem",textTransform:"uppercase",letterSpacing:"0.06em",marginBottom:3}}>{l}</div>
              <div style={{color:c,fontSize:"1.4rem",fontWeight:800,fontFamily:"'JetBrains Mono',monospace",lineHeight:1}}>{v}</div>
            </div>
          ))}
        </div>

        {/* 탭 */}
        <div style={{display:"flex",gap:3,background:"#0a0c12",borderRadius:10,padding:3,border:"1px solid #1e2230",marginBottom:"1.2rem"}}>
          {tabs.map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)} style={{
              flex:1,padding:"0.45rem 0.4rem",borderRadius:7,border:"none",cursor:"pointer",
              background:tab===t.id?"linear-gradient(135deg,#6366f1,#8b5cf6)":"transparent",
              color:tab===t.id?"white":"#4b5563",
              fontSize:"0.78rem",fontWeight:tab===t.id?700:400}}>{t.label}</button>
          ))}
        </div>

        <div className="fade" key={tab}>
          {tab==="schedule"&&<ScheduleView data={data} setData={setData} initDate={scheduleDate}
            activeTimer={activeTimer} onStartTimer={startTimer} onStopTimer={stopTimer}/>}
          {tab==="goals"&&<GoalOverview data={data} setData={setData}/>}
          {tab==="calendar"&&<CalendarView data={data} setData={setData} onSelectDate={d=>{setScheduleDate(d);setTab("schedule");}}/>}
          {tab==="wrongs"&&<WrongFolder wrongs={data.wrongs} onDelete={delWrong} onEdit={w=>{setEditWrong(w);setModal("wrong");}} folderNames={data.folderNames||{}} onRenameFolder={renameFolder}
            onPractice={e=>setPracticeQueue([e])}
            onPracticeGroup={list=>setPracticeQueue(list)}
            onUpdateCounts={updateWrongCounts}
          />}
        </div>
      </main>

      {/* 모달 */}
      {modal==="adhocTimer"&&<AdhocStudyTimerModal activeTimer={activeTimer} onStart={startAdhocTimer} onClose={()=>setModal(null)}/>}
      {modal==="wrong"&&<WrongForm editData={editWrong} onSave={w=>{editWrong?updateWrong(w):addWrong(w);setModal(null);setEditWrong(null);}} onClose={()=>{setModal(null);setEditWrong(null);}} onDelete={id=>{delWrong(id);setModal(null);setEditWrong(null);}}/>}
      {modal==="backup"&&<BackupModal data={data} onImport={d=>setData(d)} onClose={()=>setModal(null)}/>}
      {modal==="report"&&<ReportExport data={data} onClose={()=>setModal(null)}/>}
      {practiceQueue&&practiceQueue.length>0&&(
        <PracticeMode queue={practiceQueue} onExit={()=>setPracticeQueue(null)} onResult={handlePracticeResult}/>
      )}
    </div>
  );
}
