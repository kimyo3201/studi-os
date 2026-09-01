import { useState, useEffect, useRef, useCallback } from "react";

// ── 상수 ──────────────────────────────────────────────────────────────────────
const SUBJECTS = ["수학","영어","국어","과학","사회","한국사","물리","화학","생물","지구과학","기타"];

// 계획 실패 사유 코드 — "실패" 뒤에 숨은 진짜 원인을 분리해서 보기 위함
const FAIL_REASONS = {
  TIME:       { label:"시간 부족", desc:"계획 자체가 과다했음", color:"#f59e0b" },
  FATIGUE:    { label:"체력/집중력 소진", desc:"피곤해서 못함", color:"#ef4444" },
  DIFFICULTY: { label:"예상보다 어려움", desc:"난이도 오판", color:"#a855f7" },
  AVOID:      { label:"회피", desc:"하기 싫어서 미룸", color:"#dc2626" },
  SKIP:       { label:"그냥 안 함", desc:"특별한 이유 없음", color:"#6b7280" },
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
const STORAGE_KEY = "studyos_v5";
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
  philosophyNotes: [],     // 공부 철학 노트 (과목별): { id, subject, text, date }
  tempMemos: [],           // 임시 메모 (여러 장): { id, text, date }
  permanentNotes: [],      // 영구 메모판 (과목별, 훈련 대상): { id, subject, text, date, status, blueCount, redCount }
  trainingSlots: {},       // 오늘의 훈련 슬롯: { "전과목":[id,id,id], "국어":[id], ... } 전과목=3칸, 과목별=1칸
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

function load() {
  try { const r=localStorage.getItem(STORAGE_KEY); return r?JSON.parse(r):initialData; }
  catch { return initialData; }
}

// localStorage는 5~10MB 한도가 있어 사진(base64)까지 넣으면 금방 꽉 참.
// 로컬 저장본에서는 사진 원본을 빼고, 대신 클라우드(Supabase)에는 사진 포함 전체를 저장.
// 화면에 보이는 사진은 항상 React state(메모리)에 있는 원본을 쓰므로 사용 중엔 문제 없음.
function stripHeavyData(d) {
  return {
    ...d,
    wrongs: (d.wrongs||[]).map(w => {
      const { photo, ...rest } = w;
      return photo ? { ...rest, _hasPhoto: true } : w;
    }),
  };
}

function save(d) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(stripHeavyData(d)));
  } catch(err) {
    // 그래도 용량이 넘치면(사진 뺀 것도 클 정도로 데이터가 많으면) 조용히 무시.
    // 클라우드 저장이 별도로 성사되므로 데이터 자체는 안전함.
    console.error("localStorage save failed (사진 제외 후에도 초과):", err);
  }
}

// ── 자동 스냅샷 백업 (덮어쓰기 사고 대비, 최근 7일치 보관) ────────────────────────
const SNAPSHOT_KEY = "studyos_snapshots";
function saveDailySnapshot(d) {
  try {
    const today = todayStr();
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    const snapshots = raw ? JSON.parse(raw) : {};
    // 오늘 스냅샷이 이미 있고 지금 데이터가 더 작으면(항목 수 감소) 안 덮어씀 — 실수로 줄어든 걸 스냅샷으로 보존하지 않기 위함
    const existing = snapshots[today];
    const currentSize = JSON.stringify(d).length;
    if (!existing || currentSize >= (existing.size||0)) {
      snapshots[today] = { data: d, size: currentSize, savedAt: Date.now() };
    }
    // 7일보다 오래된 스냅샷은 정리
    const cutoff = Date.now() - 7*24*60*60*1000;
    Object.keys(snapshots).forEach(k=>{ if(snapshots[k].savedAt < cutoff) delete snapshots[k]; });
    localStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snapshots));
  } catch {}
}
function listSnapshots() {
  try {
    const raw = localStorage.getItem(SNAPSHOT_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

// ── Supabase 자동 동기화 (기기 간 데이터 공유) ─────────────────────────────────
const SUPABASE_URL = "https://xvvjvrgmgircgtpxcbzl.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Inh2dmp2cmdtZ2lyY2d0cHhjYnpsIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODQwMDU5OTcsImV4cCI6MjA5OTU4MTk5N30.mfArU3TkTBhXHov5MKhglLTJRMf3Rxc7TKeNqXD-sjI";
const SYNC_ROW_ID = "main"; // 한 명이 쓰는 앱이라 고정 row 하나만 사용

async function cloudLoad() {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/study_data?id=eq.${SYNC_ROW_ID}&select=data`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}`, "Accept-Profile": "public" }
    });
    if (!res.ok) {
      console.error("cloudLoad failed:", res.status, await res.text());
      return { ok:false, data:null };
    }
    const json = await res.json();
    return { ok:true, data: json?.[0]?.data || null };
  } catch (err) {
    console.error("cloudLoad error:", err);
    return { ok:false, data:null };
  }
}

async function cloudSave(d) {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/study_data`, {
      method: "POST",
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        "Content-Profile": "public",
        Prefer: "resolution=merge-duplicates,return=minimal"
      },
      body: JSON.stringify({ id: SYNC_ROW_ID, data: d, updated_at: new Date().toISOString() })
    });
    if (!res.ok) {
      console.error("cloudSave failed:", res.status, await res.text());
      return false;
    }
    return true;
  } catch (err) {
    console.error("cloudSave error:", err);
    return false;
  }
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
        onSave({id,date,subject,content,status:"todo",rootId:editData?.rootId||id});
        onClose();
      }}>저장</Btn>
    </Modal>
  );
}

// ── 계획 완료 체크 모달 (완료 누르면 반드시 거쳐야 함) ─────────────────────────────
// 계획 실패 시 사유 선택 (실패 뒤에 숨은 진짜 원인 분리)
function FailReasonModal({onSelect, onClose}) {
  return (
    <Modal title="❌ 왜 실패했어?" onClose={onClose}>
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {Object.entries(FAIL_REASONS).map(([code,r])=>(
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

function PlanCard({plan,onStatus,onEdit,onDelete,activeTimer,onStartTimer,onStopTimer}) {
  const [failModalOpen,setFailModalOpen]=useState(false);
  const c=SUBJECT_COLORS[plan.subject];
  const statusStyle = {
    todo:  {bg:"#1e2230", color:"#6b7280", label:"예정"},
    done:  {bg:"#22c55e20", color:"#22c55e", label:"✅ 완료"},
    failed:{bg:"#ef444420", color:"#ef4444", label:"❌ 실패"},
  }[plan.status]||{bg:"#1e2230",color:"#6b7280",label:"예정"};
  const isRunning = activeTimer && activeTimer.planId===plan.id;
  const failReason = plan.failReason ? FAIL_REASONS[plan.failReason] : null;

  return (
    <div style={{background:"#0a0c12",border:`1px solid ${isRunning?(c?.bg||"#6366f1"):plan.status==="done"?"#22c55e30":plan.status==="failed"?"#ef444430":"#1e2230"}`,
      borderRadius:11,padding:"0.85rem 1rem",marginBottom:6,opacity:plan.status==="done"?0.7:1}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
        <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
          <span style={{color:c?.text||"#a5b4fc",fontWeight:800,fontSize:"0.82rem"}}>{plan.subject}</span>
          <span style={{background:statusStyle.bg,color:statusStyle.color,fontSize:"0.7rem",padding:"0.12rem 0.5rem",borderRadius:99,fontWeight:700}}>{statusStyle.label}</span>
          {failReason&&(
            <span style={{background:`${failReason.color}20`,color:failReason.color,fontSize:"0.66rem",padding:"0.1rem 0.45rem",borderRadius:99,fontWeight:700}}>{failReason.label}</span>
          )}
          {plan.totalMinutes>0&&(
            <span style={{color:"#f59e0b",fontSize:"0.68rem",fontFamily:"'JetBrains Mono',monospace",fontWeight:700}}>
              ⏱ {Math.floor(plan.totalMinutes/60)>0?`${Math.floor(plan.totalMinutes/60)}h `:""}{plan.totalMinutes%60}m
            </span>
          )}
        </div>
        <div style={{display:"flex",gap:5,flexShrink:0}}>
          <button onClick={()=>onEdit(plan)} style={{background:"none",border:"none",color:"#4b5563",cursor:"pointer",fontSize:"0.7rem"}}>수정</button>
          <button onClick={()=>onDelete(plan.id)} style={{background:"none",border:"none",color:"#2d3241",cursor:"pointer",fontSize:"0.82rem"}}>×</button>
        </div>
      </div>
      <div style={{color:plan.status==="done"?"#4b5563":"#d1d5db",fontSize:"0.82rem",lineHeight:1.6,marginBottom:plan.note?6:8,textDecoration:plan.status==="done"?"line-through":"none"}}>{plan.content}</div>
      {plan.note&&<div style={{color:"#4b5563",fontSize:"0.72rem",marginBottom:8}}>📌 {plan.note}</div>}

      {/* 타이머 버튼 */}
      {plan.status==="todo"&&onStartTimer&&(
        <div style={{marginBottom:6}}>
          {isRunning ? (
            <button onClick={onStopTimer} style={{width:"100%",padding:"0.4rem",borderRadius:7,border:"1px solid #ef444440",background:"#ef444418",color:"#ef4444",fontSize:"0.76rem",fontWeight:700,cursor:"pointer"}}>■ 타이머 정지</button>
          ) : (
            <button onClick={()=>onStartTimer(plan)} disabled={!!activeTimer} style={{
              width:"100%",padding:"0.4rem",borderRadius:7,
              border:`1px solid ${activeTimer?"#2a2d3a":(c?.bg||"#6366f1")+"50"}`,
              background:activeTimer?"transparent":(c?.bg||"#6366f1")+"18",
              color:activeTimer?"#4b5563":(c?.text||"#a5b4fc"),
              fontSize:"0.76rem",fontWeight:700,
              cursor:activeTimer?"not-allowed":"pointer"
            }}>{activeTimer?"다른 타이머 실행 중":"▶ 타이머 시작"}</button>
          )}
        </div>
      )}

      {/* 상태 버튼 */}
      {plan.status==="todo"&&(
        <div style={{display:"flex",gap:6}}>
          <button onClick={()=>onStatus(plan.id,"done")} style={{flex:1,padding:"0.35rem",borderRadius:7,border:"1px solid #22c55e40",background:"#22c55e15",color:"#22c55e",fontSize:"0.75rem",fontWeight:700,cursor:"pointer"}}>✅ 완료</button>
          <button onClick={()=>setFailModalOpen(true)} style={{flex:1,padding:"0.35rem",borderRadius:7,border:"1px solid #ef444440",background:"#ef444415",color:"#ef4444",fontSize:"0.75rem",fontWeight:700,cursor:"pointer"}}>❌ 실패 → 내일로</button>
        </div>
      )}
      {plan.status==="failed"&&(
        <div style={{color:"#ef4444",fontSize:"0.7rem"}}>→ {nextDay(plan.date)}로 이동됨</div>
      )}

      {failModalOpen&&(
        <FailReasonModal
          onSelect={code=>{ onStatus(plan.id,"failed",code); setFailModalOpen(false); }}
          onClose={()=>setFailModalOpen(false)}
        />
      )}
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

  const current = queue[idx];
  const isLast = idx>=queue.length-1;

  function mark(result){ // "correct" | "wrong"
    onResult(current, result);
    setResults(r=>({...r, [result]: r[result]+1}));
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

  // 계획 집계
  const plans=(data.plans2||[]).filter(p=>new Date(p.date)>=cutoff);
  const planDone=plans.filter(p=>p.status==="done").length;
  const planFailed=plans.filter(p=>p.status==="failed").length;
  const planTodo=plans.filter(p=>p.status==="todo").length;
  // 이월(실패 반복)로 같은 계획이 여러 항목으로 쪼개져도 rootId 기준으로 중복 없이 세기
  const uniqueRootIds = new Set(plans.map(p=>p.rootId||p.id));
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
  lines.push(`고유 계획: ${uniquePlanCount}개 (이월 포함 총 시도 ${plans.length}회) | 완료: ${planDone}개 | 실패: ${planFailed}개 | 예정: ${planTodo}개`);
  if(uniquePlanCount>0) lines.push(`달성률: ${Math.round((planDone/uniquePlanCount)*100)}% (고유 계획 기준)`);

  // 실패 사유별 집계 — "실패"라는 숫자 뒤에 숨은 진짜 원인 분리
  const failedPlans = plans.filter(p=>p.status==="failed");
  if(failedPlans.length>0){
    lines.push("");
    lines.push(`[실패 사유 분석] 총 ${failedPlans.length}개`);
    const byReason={};
    failedPlans.forEach(p=>{ const r=p.failReason||"미분류"; if(!byReason[r]) byReason[r]=[]; byReason[r].push(p); });
    Object.entries(byReason).sort((a,b)=>b[1].length-a[1].length).forEach(([code,list])=>{
      const label = FAIL_REASONS[code]?.label || code;
      lines.push(`${label}: ${list.length}개 (${Math.round((list.length/failedPlans.length)*100)}%)`);
      list.slice(0,5).forEach(p=>{
        lines.push(`  - [${p.date}|${p.subject}] ${p.content.slice(0,30)}`);
      });
    });
  }

  const trackedPlans = plans.filter(p=>p.totalMinutes>0);
  if(trackedPlans.length>0){
    const totalTrackedMin = trackedPlans.reduce((a,p)=>a+p.totalMinutes,0);
    lines.push(`타이머 기록 총합: ${Math.floor(totalTrackedMin/60)}시간 ${totalTrackedMin%60}분 (${trackedPlans.length}개 계획)`);
    [...trackedPlans].sort((a,b)=>b.totalMinutes-a.totalMinutes).forEach(p=>{
      lines.push(`- [${p.subject}] ${p.content.slice(0,40)}: ${Math.floor(p.totalMinutes/60)}h ${p.totalMinutes%60}m`);
    });
  }

  // 영구 메모판 + 훈련 현황
  const permNotesAll = data.permanentNotes||[];
  const trainingSlots = data.trainingSlots||{};
  lines.push("");
  lines.push(`[영구 메모판] 총 ${permNotesAll.length}개 (체화 ${permNotesAll.filter(p=>p.status==="learned").length}개 · 훈련중 ${permNotesAll.filter(p=>p.status!=="learned").length}개)`);
  if(permNotesAll.length===0) lines.push("- 등록된 메모 없음");
  else {
    const bySubj={};
    permNotesAll.forEach(p=>{ if(!bySubj[p.subject]) bySubj[p.subject]=[]; bySubj[p.subject].push(p); });
    Object.entries(bySubj).forEach(([subj,list])=>{
      lines.push(`${subj}:`);
      list.forEach(p=>{
        lines.push(`  - ${p.text} : 🔵${p.blueCount||0} 🔴${p.redCount||0} ${p.status==="learned"?"[체화됨]":"[훈련중]"}`);
      });
    });
  }
  lines.push("");
  lines.push(`[현재 훈련 슬롯]`);
  const anySlot = Object.values(trainingSlots).some(v=>(v||[]).length>0);
  if(!anySlot) lines.push("- 없음");
  else Object.entries(trainingSlots).forEach(([subj,ids])=>{
    if(!ids||ids.length===0) return;
    const names = ids.map(id=>permNotesAll.find(p=>p.id===id)?.text||"?").join(" / ");
    lines.push(`- [${subj}] ${names}`);
  });

  // 임시 메모
  const tempNotesR = (data.tempMemos||[]).filter(n=>new Date(n.date)>=cutoff && new Date(n.date)<=now);
  lines.push("");
  lines.push(`[임시 메모] ${tempNotesR.length}개`);
  if(tempNotesR.length===0) lines.push("- 없음");
  else tempNotesR.sort((a,b)=>a.date.localeCompare(b.date)).forEach(n=>{
    lines.push(`- [${n.date}] ${n.text}`);
  });

  // 영구 메모판
  const permNotesR = (data.permanentNotes||[]).filter(n=>new Date(n.date)>=cutoff && new Date(n.date)<=now);
  lines.push("");
  lines.push(`[영구 메모판] ${permNotesR.length}개`);
  if(permNotesR.length===0) lines.push("- 없음");
  else permNotesR.sort((a,b)=>a.date.localeCompare(b.date)).forEach(n=>{
    lines.push(`- [${n.date}] ${n.text}`);
  });

  // 공부 철학 노트 (과목별)
  const philNotesR = (data.philosophyNotes||[]).filter(n=>new Date(n.date)>=cutoff && new Date(n.date)<=now);
  lines.push("");
  lines.push(`[공부 철학 노트] ${philNotesR.length}개`);
  if(philNotesR.length===0) lines.push("- 없음");
  else {
    const byPhilSubj={};
    philNotesR.forEach(n=>{ const s=n.subject||"전과목"; if(!byPhilSubj[s]) byPhilSubj[s]=[]; byPhilSubj[s].push(n); });
    Object.entries(byPhilSubj).forEach(([s,list])=>{
      lines.push(`${s}:`);
      list.sort((a,b)=>a.date.localeCompare(b.date)).forEach(n=>{
        lines.push(`  - [${n.date}] ${n.text}`);
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

// ── 별점 컴포넌트 (주간 훈련 평가에서 사용) ─────────────────────────────────────
// ── 과목별 영구 메모판 + 훈련 슬롯 ────────────────────────────────────────────
// data.permanentNotes: [{id, subject, text, date, status, blueCount, redCount}]
// data.trainingSlots: {"전과목":[id,id,id], "국어":[id], "영어":[id], ...}  전과목=3칸, 과목별=1칸
// data.tempMemos: [{id, text, date}]
// data.philosophyNotes: [{id, subject, text, date}]

const PS_SUBJECTS = ["전과목","국어","영어","수학","사회","과학","한국사"];
const TRAINING_SLOT_MAX = { "전과목":3 };
function slotMax(subject){ return TRAINING_SLOT_MAX[subject] || 1; }

// 영구 메모판 노트 하나 (훈련 슬롯에 넣고 뺄 수 있음, 훈련 중이면 성공/실패 마킹 가능)
function PermNote({note, inTraining, onToggleTraining, onEdit, onDelete, onMark}) {
  const learned = note.status==="learned";
  const bg = learned ? "#1e3a5f" : inTraining ? "#3a2e1e" : "#3a2e4a";
  const rot = ((note.id % 7) - 3) * 0.6;
  return (
    <div style={{
      background:bg, border:`1px solid ${inTraining?"#fbbf24":"rgba(255,255,255,0.08)"}`,
      borderRadius:4, padding:"0.6rem 0.65rem", minHeight:88, display:"flex", flexDirection:"column",
      justifyContent:"space-between", boxShadow:"0 3px 8px rgba(0,0,0,0.3)", transform:`rotate(${rot}deg)`,
      position:"relative"
    }}>
      {inTraining && <div style={{position:"absolute",top:4,right:5,fontSize:"0.62rem"}}>📌</div>}
      <div style={{color:"#f1f3f9",fontSize:"0.73rem",lineHeight:1.4,whiteSpace:"pre-wrap",wordBreak:"break-word"}}>{note.text}</div>
      <div>
        {inTraining && (
          <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:4,flexWrap:"wrap"}}>
            <span style={{fontSize:"0.62rem",color:"#93c5fd"}}>🔵×{note.blueCount||0}</span>
            <span style={{fontSize:"0.62rem",color:"#fca5a5"}}>🔴×{note.redCount||0}</span>
            {(note.streak||0)>0 && <span style={{fontSize:"0.6rem",color:"#fbbf24"}}>연속{note.streak}</span>}
          </div>
        )}
        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
          <button onClick={()=>onToggleTraining(note)} style={{
            background:inTraining?"#ef444425":"#fbbf2425", border:"none",borderRadius:4,
            color:inTraining?"#fca5a5":"#fde68a", cursor:"pointer",fontSize:"0.6rem",padding:"0.15rem 0.4rem",fontWeight:700
          }}>{inTraining?"훈련 내리기":"훈련에 올리기"}</button>
          <div style={{display:"flex",gap:3}}>
            {inTraining && <>
              <button onClick={()=>onMark(note.id,"blue")} style={{background:"#3b82f630",border:"none",borderRadius:3,color:"#93c5fd",cursor:"pointer",fontSize:"0.6rem",padding:"0.1rem 0.3rem"}}>✓</button>
              <button onClick={()=>onMark(note.id,"red")} style={{background:"#ef444430",border:"none",borderRadius:3,color:"#fca5a5",cursor:"pointer",fontSize:"0.6rem",padding:"0.1rem 0.3rem"}}>✗</button>
            </>}
            <button onClick={()=>onEdit(note)} style={{background:"none",border:"none",color:"#9ca3af",cursor:"pointer",fontSize:"0.62rem"}}>✎</button>
            <button onClick={()=>onDelete(note.id)} style={{background:"none",border:"none",color:"#9ca3af",cursor:"pointer",fontSize:"0.68rem"}}>×</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// 오늘의 훈련 — 전과목 3칸 + 과목별 1칸씩, 한 화면에 전부
function TodayTrainingBoard({notes, trainingSlots, onMark}) {
  return (
    <div style={{background:"#f59e0b0c",border:"1px solid #f59e0b30",borderRadius:12,padding:"0.8rem 1rem",marginBottom:"1.1rem"}}>
      <div style={{color:"#f59e0b",fontSize:"0.74rem",fontWeight:800,marginBottom:8}}>📌 오늘의 훈련</div>
      <div style={{display:"flex",flexDirection:"column",gap:8}}>
        {PS_SUBJECTS.map(subj=>{
          const ids = trainingSlots[subj]||[];
          const items = ids.map(id=>notes.find(n=>n.id===id)).filter(Boolean);
          const max = slotMax(subj);
          const c = SUBJECT_COLORS[subj]||{text:"#a5b4fc"};
          return (
            <div key={subj}>
              <div style={{color:c.text,fontSize:"0.66rem",fontWeight:700,marginBottom:4}}>{subj} ({items.length}/{max})</div>
              {items.length===0
                ? <div style={{color:"#4b5563",fontSize:"0.72rem",paddingLeft:2}}>영구 메모판에서 이 과목 메모를 훈련에 올려봐</div>
                : <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(140px,1fr))",gap:6}}>
                    {items.map(n=>(
                      <div key={n.id} style={{background:"#0a0c12",border:"1px solid #1e2230",borderRadius:8,padding:"0.45rem 0.55rem"}}>
                        <div style={{color:"#d1d5db",fontSize:"0.72rem",lineHeight:1.4,marginBottom:5}}>{n.text}</div>
                        <div style={{display:"flex",gap:4}}>
                          <button onClick={()=>onMark(n.id,"blue")} style={{flex:1,background:"#3b82f620",border:"1px solid #3b82f640",borderRadius:5,color:"#93c5fd",cursor:"pointer",fontSize:"0.64rem",padding:"0.2rem",fontWeight:700}}>✓ 성공</button>
                          <button onClick={()=>onMark(n.id,"red")} style={{flex:1,background:"#ef444420",border:"1px solid #ef444440",borderRadius:5,color:"#fca5a5",cursor:"pointer",fontSize:"0.64rem",padding:"0.2rem",fontWeight:700}}>✗ 실패</button>
                        </div>
                      </div>
                    ))}
                  </div>
              }
            </div>
          );
        })}
      </div>
    </div>
  );
}

// 색깔만 다른 단순 포스트잇 카드 (임시메모/철학노트 공용)
function SimplePostit({note, bg, textColor, onEdit, onDelete}) {
  const rot=((note.id%7)-3)*0.6;
  return (
    <div style={{background:bg,border:"1px solid rgba(255,255,255,0.08)",borderRadius:4,
      padding:"0.6rem 0.65rem",minHeight:80,boxShadow:"0 3px 8px rgba(0,0,0,0.3)",transform:`rotate(${rot}deg)`,
      display:"flex",flexDirection:"column",justifyContent:"space-between"}}>
      <div style={{color:"#f1f3f9",fontSize:"0.74rem",lineHeight:1.4,whiteSpace:"pre-wrap"}}>{note.text}</div>
      <div style={{display:"flex",justifyContent:"flex-end",gap:6,marginTop:6}}>
        <button onClick={()=>onEdit(note)} style={{background:"none",border:"none",color:textColor,cursor:"pointer",fontSize:"0.64rem"}}>✎</button>
        <button onClick={()=>onDelete(note.id)} style={{background:"none",border:"none",color:textColor,cursor:"pointer",fontSize:"0.7rem"}}>×</button>
      </div>
    </div>
  );
}

function SimplePostitForm({onSave, onClose, editData, title, placeholder}) {
  const [text,setText]=useState(editData?.text||"");
  return (
    <Modal title={title} onClose={onClose}>
      <div style={{marginBottom:"1.2rem"}}>
        <textarea autoFocus value={text} onChange={e=>setText(e.target.value)} rows={3} style={{...inp,resize:"vertical"}}
          placeholder={placeholder}/>
      </div>
      <Btn full onClick={()=>{
        if(!text.trim())return;
        onSave({ id:editData?.id||Date.now(), text:text.trim(), date:editData?.date||todayStr() });
        onClose();
      }}>저장</Btn>
    </Modal>
  );
}

function SubjectMemoSystem({data, setData}) {
  const [permSubject,setPermSubject]=useState("전과목");
  const [philSubject,setPhilSubject]=useState("전과목");
  const [modal,setModal]=useState(null); // "permAdd"|"permEdit"|"tempAdd"|"tempEdit"|"philAdd"|"philEdit"
  const [editNote,setEditNote]=useState(null);

  const permNotes = data.permanentNotes||[];
  const tempMemos = data.tempMemos||[];
  const philNotes = data.philosophyNotes||[];
  const trainingSlots = data.trainingSlots||{};
  const permSubjectNotes = permNotes.filter(n=>n.subject===permSubject);
  const philSubjectNotes = philNotes.filter(n=>n.subject===philSubject);

  function savePerm(n){
    setData(d=>{
      const list=[...(d.permanentNotes||[])];
      const idx=list.findIndex(x=>x.id===n.id);
      if(idx>=0) list[idx]={...list[idx], ...n, subject:permSubject};
      else list.push({...n, subject:permSubject, status:"training", blueCount:0, redCount:0, streak:0});
      return {...d, permanentNotes:list};
    });
  }
  function deletePerm(id){
    setData(d=>{
      const slots={...(d.trainingSlots||{})};
      for(const k in slots) slots[k]=(slots[k]||[]).filter(x=>x!==id);
      return {...d, permanentNotes:(d.permanentNotes||[]).filter(n=>n.id!==id), trainingSlots:slots};
    });
  }
  function toggleTraining(note){
    setData(d=>{
      const slots={...(d.trainingSlots||{})};
      const subj=note.subject;
      const cur=slots[subj]||[];
      if(cur.includes(note.id)){
        slots[subj]=cur.filter(x=>x!==note.id);
      } else {
        if(cur.length>=slotMax(subj)){ alert(`${subj} 훈련 슬롯은 최대 ${slotMax(subj)}개까지야`); return d; }
        slots[subj]=[...cur, note.id];
      }
      return {...d, trainingSlots:slots};
    });
  }
  function markPerm(id, color){
    setData(d=>{
      const list=(d.permanentNotes||[]).map(n=>{
        if(n.id!==id) return n;
        const blueCount = color==="blue" ? (n.blueCount||0)+1 : n.blueCount||0;
        const redCount = color==="red" ? (n.redCount||0)+1 : n.redCount||0;
        // 연속 파랑 횟수: 빨강이 나오면 0으로 리셋, 파랑이면 +1
        const streak = color==="blue" ? (n.streak||0)+1 : 0;
        const status = streak>=2 ? "learned" : "training";
        return {...n, blueCount, redCount, streak, status};
      });
      return {...d, permanentNotes:list};
    });
  }
  function saveTemp(n){
    setData(d=>{
      const list=[...(d.tempMemos||[])];
      const idx=list.findIndex(x=>x.id===n.id);
      if(idx>=0) list[idx]=n; else list.push(n);
      return {...d, tempMemos:list};
    });
  }
  function deleteTemp(id){
    setData(d=>({...d, tempMemos:(d.tempMemos||[]).filter(n=>n.id!==id)}));
  }
  function savePhil(n){
    setData(d=>{
      const list=[...(d.philosophyNotes||[])];
      const idx=list.findIndex(x=>x.id===n.id);
      if(idx>=0) list[idx]={...n, subject:philSubject}; else list.push({...n, subject:philSubject});
      return {...d, philosophyNotes:list};
    });
  }
  function deletePhil(id){
    setData(d=>({...d, philosophyNotes:(d.philosophyNotes||[]).filter(n=>n.id!==id)}));
  }

  return (
    <div>
      <TodayTrainingBoard notes={permNotes} trainingSlots={trainingSlots} onMark={markPerm}/>

      {/* 영구 메모판 — 과목별 */}
      <div style={{marginBottom:"1.4rem"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"0.7rem"}}>
          <span style={{color:"#a78bfa",fontSize:"0.8rem",fontWeight:800}}>📌 영구 메모판</span>
          <Btn small color="#a78bfa" onClick={()=>{setEditNote(null);setModal("permAdd");}}>+ 메모</Btn>
        </div>
        <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:"0.8rem"}}>
          {PS_SUBJECTS.map(s=>{
            const c=SUBJECT_COLORS[s]||{bg:"#64748b",text:"#cbd5e1"};
            return (
              <button key={s} onClick={()=>setPermSubject(s)} style={{
                padding:"0.28rem 0.7rem",borderRadius:7,cursor:"pointer",
                border:`1.5px solid ${permSubject===s?c.bg:"#2a2d3a"}`,
                background:permSubject===s?c.bg+"22":"transparent",
                color:permSubject===s?c.text:"#6b7280",fontSize:"0.72rem",fontWeight:700
              }}>{s}</button>
            );
          })}
        </div>
        {permSubjectNotes.length===0
          ? <div style={{color:"#2d3241",fontSize:"0.82rem",textAlign:"center",padding:"1.5rem 0"}}>{permSubject} 공부하다 드는 생각들을 여기 모아둬</div>
          : <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:8}}>
              {permSubjectNotes.map(n=>(
                <PermNote key={n.id} note={n} inTraining={(trainingSlots[n.subject]||[]).includes(n.id)}
                  onToggleTraining={toggleTraining} onEdit={n=>{setEditNote(n);setModal("permEdit");}}
                  onDelete={deletePerm} onMark={markPerm}/>
              ))}
            </div>
        }
      </div>

      {/* 임시 메모 — 노란색, 여러 장 */}
      <div style={{borderTop:"1px solid #1e2230",paddingTop:"1.2rem",marginBottom:"1.2rem"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"0.8rem"}}>
          <span style={{color:"#fbbf24",fontSize:"0.8rem",fontWeight:800}}>📝 임시 메모</span>
          <Btn small color="#fbbf24" onClick={()=>{setEditNote(null);setModal("tempAdd");}}>+ 메모</Btn>
        </div>
        {tempMemos.length===0
          ? <div style={{color:"#2d3241",fontSize:"0.82rem",textAlign:"center",padding:"1.2rem 0"}}>스쳐가는 생각을 대충 적어둬</div>
          : <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:8}}>
              {tempMemos.map(n=>(
                <SimplePostit key={n.id} note={n} bg="#4a3f1e" textColor="#fde68a"
                  onEdit={n=>{setEditNote(n);setModal("tempEdit");}} onDelete={deleteTemp}/>
              ))}
            </div>
        }
      </div>

      {/* 공부 철학 노트 — 초록색, 과목별 */}
      <div style={{borderTop:"1px solid #1e2230",paddingTop:"1.2rem"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"0.8rem"}}>
          <span style={{color:"#4ade80",fontSize:"0.8rem",fontWeight:800}}>📔 공부 철학 노트</span>
          <Btn small color="#4ade80" onClick={()=>{setEditNote(null);setModal("philAdd");}}>+ 노트</Btn>
        </div>
        <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:"0.8rem"}}>
          {PS_SUBJECTS.map(s=>{
            const c=SUBJECT_COLORS[s]||{bg:"#64748b",text:"#cbd5e1"};
            return (
              <button key={s} onClick={()=>setPhilSubject(s)} style={{
                padding:"0.25rem 0.65rem",borderRadius:7,cursor:"pointer",
                border:`1.5px solid ${philSubject===s?c.bg:"#2a2d3a"}`,
                background:philSubject===s?c.bg+"22":"transparent",
                color:philSubject===s?c.text:"#6b7280",fontSize:"0.7rem",fontWeight:700
              }}>{s}</button>
            );
          })}
        </div>
        {philSubjectNotes.length===0
          ? <div style={{color:"#2d3241",fontSize:"0.82rem",textAlign:"center",padding:"1.2rem 0"}}>{philSubject} 관련 가치관, 마음가짐을 적어봐</div>
          : <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(140px,1fr))",gap:8}}>
              {philSubjectNotes.map(n=>(
                <SimplePostit key={n.id} note={n} bg="#1e3a2e" textColor="#86efac"
                  onEdit={n=>{setEditNote(n);setModal("philEdit");}} onDelete={deletePhil}/>
              ))}
            </div>
        }
      </div>

      {(modal==="permAdd"||modal==="permEdit")&&(
        <SimplePostitForm editData={modal==="permEdit"?editNote:null}
          title={modal==="permEdit"?"영구 메모 수정":`${permSubject} 영구 메모판에 추가`}
          placeholder="공부하다 든 생각 한 줄"
          onSave={n=>{savePerm(n);setModal(null);setEditNote(null);}}
          onClose={()=>{setModal(null);setEditNote(null);}}/>
      )}
      {(modal==="tempAdd"||modal==="tempEdit")&&(
        <SimplePostitForm editData={modal==="tempEdit"?editNote:null}
          title={modal==="tempEdit"?"임시 메모 수정":"임시 메모 추가"}
          placeholder="지금 드는 생각을 대충 적어둬"
          onSave={n=>{saveTemp(n);setModal(null);setEditNote(null);}}
          onClose={()=>{setModal(null);setEditNote(null);}}/>
      )}
      {(modal==="philAdd"||modal==="philEdit")&&(
        <SimplePostitForm editData={modal==="philEdit"?editNote:null}
          title={modal==="philEdit"?"철학 노트 수정":`${philSubject} 철학 노트 추가`}
          placeholder="예: 재미없어도 그냥 앉아서 시작한다"
          onSave={n=>{savePhil(n);setModal(null);setEditNote(null);}}
          onClose={()=>{setModal(null);setEditNote(null);}}/>
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

  const hours=Array.from({length:TOTAL_HOURS},(_,i)=>(START_HOUR+i)%24);
  const daySlots=data.timetable[date]||{};
  const totalMins=calcMinutes(daySlots);
  const subMins=calcSubjectMinutes(daySlots);
  const dayPlans=(data.plans2||[]).filter(p=>p.date===date).sort((a,b)=>a.subject.localeCompare(b.subject));

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
  function deletePlan(id){setData(d=>({...d,plans2:(d.plans2||[]).filter(p=>p.id!==id)}));}
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
            {planView==="day"&&<Btn small color="#6366f1" onClick={()=>{setEditPlan(null);setPlanModal("add");}}>+ 계획 추가</Btn>}
          </div>

          {planView==="day"&&(
            <>
              <div style={{marginBottom:8}}>
                <span style={{color:"#9ca3af",fontSize:"0.76rem",fontWeight:700}}>
                  오늘 계획 <span style={{color:"#6366f1"}}>{dayPlans.length}개</span>
                  <span style={{color:"#22c55e",marginLeft:6}}>✅{dayPlans.filter(p=>p.status==="done").length}</span>
                  <span style={{color:"#ef4444",marginLeft:4}}>❌{dayPlans.filter(p=>p.status==="failed").length}</span>
                </span>
              </div>
              {dayPlans.length===0
                ?<div style={{color:"#2d3241",fontSize:"0.8rem",textAlign:"center",padding:"2rem 0"}}>계획 없음</div>
                :dayPlans.map(p=><PlanCard key={p.id} plan={p} onStatus={setStatus}
                    onEdit={p=>{setEditPlan(p);setPlanModal("edit");}} onDelete={deletePlan}
                    activeTimer={activeTimer} onStartTimer={onStartTimer} onStopTimer={onStopTimer}/>)
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
            const weekPlans=(data.plans2||[]).filter(p=>weekDates.includes(p.date));
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
                        activeTimer={activeTimer} onStartTimer={onStartTimer} onStopTimer={onStopTimer}/>)}
                    </div>
                  );
                })}
                {weekPlans.length===0&&<div style={{color:"#2d3241",fontSize:"0.8rem",textAlign:"center",padding:"2rem 0"}}>이번 주 계획 없음</div>}
              </div>
            );
          })()}

          {planView==="month"&&(()=>{
            const ym=date.slice(0,7);
            const monthPlans=(data.plans2||[]).filter(p=>p.date.startsWith(ym));
            const bySubj={};
            for(const p of monthPlans){bySubj[p.subject]=(bySubj[p.subject]||0)+1;}
            const done=monthPlans.filter(p=>p.status==="done").length;
            const failed=monthPlans.filter(p=>p.status==="failed").length;
            const uniqueCount=new Set(monthPlans.map(p=>p.rootId||p.id)).size;
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
  const selDayPlans = selDateStr ? (data.plans2||[]).filter(p=>p.date===selDateStr) : [];

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
          const plans=(data.plans2||[]).filter(p=>p.date===dateStr);
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
          const mp=(data.plans2||[]).filter(p=>p.date.startsWith(year+"-"+String(month+1).padStart(2,"0")));
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


// ── 메인 ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [data,setData]=useState(load);
  const [tab,setTab]=useState("schedule");
  const [modal,setModal]=useState(null);
  const [editWrong,setEditWrong]=useState(null);
  const [scheduleDate,setScheduleDate]=useState(studyDayStr());
  const [practiceQueue,setPracticeQueue]=useState(null); // array of wrong entries with photo
  const [syncStatus,setSyncStatus]=useState("idle"); // idle | syncing | synced | error
  const cloudTimerRef = useRef(null);
  const initialSyncDone = useRef(false);
  const skipNextSaveRef = useRef(false); // 초기 동기화용 setData 직후 한 번은 타임스탬프 재기록을 건너뜀

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
    setActiveTimer({planId:plan.id, subject:plan.subject, content:plan.content, startedAt:Date.now(), date:plan.date});
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
        // 이 계획에 실행 시간 누적 + 실행 이력 기록
        const plans=(d.plans2||[]).map(p=>{
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

  // 앱 켜질 때 클라우드 데이터와 로컬 데이터 중 "더 최신"인 쪽을 사용
  // (빈 클라우드 데이터가 로컬의 실제 기록을 덮어쓰는 사고를 방지)
  useEffect(()=>{
    (async () => {
      // 처음부터 오프라인이면 클라우드 요청 자체를 시도하지 않고 로컬 데이터로 즉시 시작
      if (typeof navigator !== "undefined" && navigator.onLine === false) {
        setData(load());
        initialSyncDone.current = true;
        setSyncStatus("offline");
        return;
      }
      setSyncStatus("syncing");
      const cloudResult = await cloudLoad();
      const localData = load();

      if (!cloudResult.ok) {
        // 클라우드 요청 자체가 실패 (네트워크/API 오류) → 로컬 유지, 실패 표시
        setData(localData);
        initialSyncDone.current = true;
        setSyncStatus("error");
        return;
      }

      const cloudData = cloudResult.data;
      const localTime = localData?._syncedAt || 0;
      const cloudTime = cloudData?._syncedAt || 0;

      // 데이터가 "사실상 비어있는지" 판정 — 모든 필드를 다 확인해야 함
      // (일부 필드만 확인하면, 실제 데이터가 있는데도 비어있다고 오판해서
      //  로컬의 빈 상태로 클라우드/서로의 진짜 데이터를 덮어쓰는 사고가 남)
      function isEffectivelyEmpty(d){
        if(!d) return true;
        return (
          Object.keys(d.timetable||{}).length===0 &&
          Object.keys(d.plans||{}).length===0 &&
          (d.wrongs||[]).length===0 &&
          (d.permanentNotes||[]).length===0 &&
          (d.philosophyNotes||[]).length===0 &&
          (d.tempMemos||[]).length===0 &&
          (d.permanentNotes||[]).length===0 &&
          (d.plans2||[]).length===0 &&
          (d.goalItems||[]).length===0 &&
          Object.keys(d.nightNotes||{}).length===0 &&
          Object.keys(d.folderNames||{}).length===0
        );
      }
      const cloudIsEmpty = isEffectivelyEmpty(cloudData);
      const localIsEmpty = isEffectivelyEmpty(localData);

      // 로컬 저장본은 용량 문제로 사진(photo)을 빼고 저장하므로,
      // 로컬 데이터를 쓰기로 하더라도 클라우드에 있던 사진들을 다시 채워 넣어야 화면에 보임.
      function restorePhotos(target, source) {
        if (!source) return target;
        const photoMap = {};
        (source.wrongs||[]).forEach(w => { if (w.photo) photoMap[w.id] = w.photo; });
        return {
          ...target,
          wrongs: (target.wrongs||[]).map(w => {
            if (w.photo) return w; // 이미 사진 있음(방금 세션에서 추가한 경우)
            const restored = photoMap[w.id];
            return restored ? { ...w, photo: restored } : w;
          }),
        };
      }

      if (!cloudIsEmpty && localIsEmpty) {
        // 로컬은 비었는데 클라우드엔 실제 데이터가 있음 → 무조건 클라우드 채택
        // (다른 기기에서 처음 여는 경우가 정확히 이 케이스)
        skipNextSaveRef.current = true;
        setData(cloudData);
      } else if (!cloudIsEmpty && cloudTime > localTime) {
        // 둘 다 데이터가 있고 클라우드가 더 최신 → 클라우드 채택
        skipNextSaveRef.current = true;
        setData(cloudData);
      } else {
        // 로컬이 더 최신이거나, 로컬에만 데이터가 있거나, 둘 다 비어있음 → 로컬 유지 + 사진 복원
        const merged = restorePhotos(localData, cloudData);
        skipNextSaveRef.current = true;
        setData(merged);
        if (!localIsEmpty) {
          const ok = await cloudSave({ ...merged, _syncedAt: Date.now() });
          if (!ok) { initialSyncDone.current = true; setSyncStatus("error"); return; }
        }
      }
      initialSyncDone.current = true;
      setSyncStatus("synced");
    })();
  },[]);

  // 로컬 저장은 즉시, 클라우드 저장은 1초 디바운스로 (너무 잦은 요청 방지)
  useEffect(()=>{
    save(data);
    // 초기 동기화 과정에서 발생한 setData는 "사용자가 방금 수정한 것"이 아니므로
    // 타임스탬프를 다시 찍어 클라우드에 재업로드하면 안 됨 — 그러면 단순히 앱을 연 것만으로도
    // "마지막으로 연 기기"가 실제 최신 여부와 무관하게 항상 동기화 우선권을 갖게 되는 버그가 생김.
    if (skipNextSaveRef.current) { skipNextSaveRef.current = false; return; }
    if (!initialSyncDone.current) return; // 초기 로드 직후 자기 자신 덮어쓰기 방지
    if (cloudTimerRef.current) clearTimeout(cloudTimerRef.current);
    setSyncStatus("syncing");
    cloudTimerRef.current = setTimeout(async () => {
      const stamped = { ...data, _syncedAt: Date.now() };
      save(stamped);
      const ok = await cloudSave(stamped);
      setSyncStatus(ok ? "synced" : "error");
      if (ok) saveDailySnapshot(stamped);
    }, 1000);
    return () => { if (cloudTimerRef.current) clearTimeout(cloudTimerRef.current); };
  },[data]);

  // 오프라인 상태에서 등록한 오답/타이머 기록은 localStorage에 그대로 남아있고
  // (cloudSave가 실패해도 조용히 넘어가도록 설계됨), 인터넷이 다시 연결되는 순간
  // 자동으로 최신 로컬 데이터를 클라우드에 재전송해서 밀린 내용을 따라잡는다.
  useEffect(()=>{
    function handleOnline(){
      if (!initialSyncDone.current) return;
      setSyncStatus("syncing");
      const stamped = { ...data, _syncedAt: Date.now() };
      save(stamped);
      cloudSave(stamped).then(ok => setSyncStatus(ok ? "synced" : "error"));
    }
    function handleOffline(){ setSyncStatus("offline"); }
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  },[data]);

  const addWrong=w=>setData(d=>({...d,wrongs:[...d.wrongs,w]}));
  const updateWrong=w=>setData(d=>({...d,wrongs:d.wrongs.map(e=>e.id===w.id?w:e)}));
  const updateWrongCounts=(id,patch)=>setData(d=>({...d,wrongs:d.wrongs.map(e=>e.id===id?{...e,...patch}:e)}));
  const delWrong=id=>setData(d=>({...d,wrongs:d.wrongs.filter(e=>e.id!==id)}));
  const renameFolder=(key,name)=>setData(d=>({...d,folderNames:{...(d.folderNames||{}),[key]:name}}));

  function handlePracticeResult(entry, result) {
    setData(d=>({
      ...d,
      wrongs: d.wrongs.map(w=>{
        if(w.id!==entry.id) return w;
        return {
          ...w,
          attemptCount: (w.attemptCount||0)+1,
          failCount: result==="wrong" ? (w.failCount||0)+1 : (w.failCount||0),
          solved: result==="correct" ? true : w.solved,
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
    {id:"memos",label:"공부법 메모"},
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
              <button onClick={()=>{
                setSyncStatus("syncing");
                cloudSave({...data,_syncedAt:Date.now()}).then(ok=>setSyncStatus(ok?"synced":"error"));
              }} style={{background:"none",border:"1px solid #ef444450",borderRadius:5,color:"#ef4444",cursor:"pointer",fontSize:"0.6rem",padding:"0.05rem 0.4rem"}}>재시도</button>
            )}
          </div>
        </div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap",justifyContent:"flex-end"}}>
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
          {tab==="memos"&&<SubjectMemoSystem data={data} setData={setData}/>}
          {tab==="calendar"&&<CalendarView data={data} setData={setData} onSelectDate={d=>{setScheduleDate(d);setTab("schedule");}}/>}
          {tab==="wrongs"&&<WrongFolder wrongs={data.wrongs} onDelete={delWrong} onEdit={w=>{setEditWrong(w);setModal("wrong");}} folderNames={data.folderNames||{}} onRenameFolder={renameFolder}
            onPractice={e=>setPracticeQueue([e])}
            onPracticeGroup={list=>setPracticeQueue(list)}
            onUpdateCounts={updateWrongCounts}
          />}
        </div>
      </main>

      {/* 모달 */}
      {modal==="wrong"&&<WrongForm editData={editWrong} onSave={w=>{editWrong?updateWrong(w):addWrong(w);setModal(null);setEditWrong(null);}} onClose={()=>{setModal(null);setEditWrong(null);}} onDelete={id=>{delWrong(id);setModal(null);setEditWrong(null);}}/>}
      {modal==="backup"&&<BackupModal data={data} onImport={d=>setData(d)} onClose={()=>setModal(null)}/>}
      {modal==="report"&&<ReportExport data={data} onClose={()=>setModal(null)}/>}
      {practiceQueue&&practiceQueue.length>0&&(
        <PracticeMode queue={practiceQueue} onExit={()=>setPracticeQueue(null)} onResult={handlePracticeResult}/>
      )}
    </div>
  );
}
