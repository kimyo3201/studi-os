import { useState, useEffect, useRef, useCallback } from "react";

// ── 상수 ──────────────────────────────────────────────────────────────────────
const SUBJECTS = ["수학","영어","국어","과학","사회","한국사","물리","화학","생물","지구과학","기타"];
const ELS_SUBJECTS = ["수학","국어","영어","과학","사회","한국사"];
// 과목별 세분화 항목. 빈 배열이면 세분화 없이 과목 자체가 하나의 단위(한국사).
const ELS_SUBCATEGORIES = {
  국어: ["내신","모의고사-문학","모의고사-문법","모의고사-비문학"],
  수학: ["내신","모의고사"],
  영어: ["독해","문법","단어암기"],
  과학: ["물리","생명","지구","화학"],
  사회: ["지리","윤리","일반","법"],
  한국사: [],
};
function elsSubKey(subject){
  const subs = ELS_SUBCATEGORIES[subject]||[];
  return subs.length>0 ? subs[0] : "전체";
}
const ELS_TRACKS = [
  { key:"구조", label:"🏗 구조", desc:"큰 흐름을 잡아야 하는가", color:"#3b82f6" },
  { key:"이해", label:"💡 이해", desc:"원리를 이해해야 하는가", color:"#f59e0b" },
  { key:"판단", label:"🎯 판단", desc:"문제 해결 능력이 중요한가", color:"#ef4444" },
  { key:"자동화", label:"⚡ 자동화", desc:"즉시 인출해야 하는가", color:"#a855f7" },
  { key:"창조", label:"🧪 창조", desc:"직접 만들면 이해가 깊어지는가", color:"#22c55e" },
];

const SUBJECT_COLORS = {
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
  elsExperiments: [],   // ELS 실험법: { id, subject, sub, track, name, note, score(0~5), order, status }
  elsReviews: [],       // 일요일 리뷰 기록: { id, weekKey, date, goodIds:[], badIds:[] }
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
function save(d) {
  try {
    localStorage.setItem(STORAGE_KEY,JSON.stringify(d));
  } catch(err) {
    alert("저장 실패! 저장 공간이 가득 찼을 수 있어. 오래된 오답 사진을 정리하거나 백업 후 데이터를 줄여줘.\n\n오류: "+(err?.message||err));
  }
}

function todayStr() { return new Date().toISOString().slice(0,10); }
function slotToTime(slot) {
  const totalMin = slot*10 + START_HOUR*60;
  const h = Math.floor(totalMin/60)%24;
  const m = totalMin%60;
  return `${String(h).padStart(2,"0")}:${String(m).padStart(2,"0")}`;
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
  fontFamily:"'Noto Sans KR',sans-serif", outline:"none", width:"100%", boxSizing:"border-box"
};

function Modal({title,onClose,children,wide}) {
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.88)",zIndex:999,display:"flex",alignItems:"center",justifyContent:"center",padding:"1rem"}}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:"#0a0c12",border:"1px solid #1e2230",borderRadius:18,padding:"1.8rem",
        maxWidth:wide?740:560,width:"100%",maxHeight:"92vh",overflowY:"auto",
        boxShadow:"0 32px 100px rgba(0,0,0,0.95)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"1.4rem"}}>
          <h3 style={{color:"#f1f3f9",margin:0,fontSize:"0.97rem",fontFamily:"'Noto Sans KR',sans-serif",fontWeight:800}}>{title}</h3>
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
      fontFamily:"'Noto Sans KR',sans-serif", fontSize:small?"0.74rem":"0.87rem",
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

function Spinner() {
  return <div style={{textAlign:"center",padding:"2.5rem 0",color:"#4b5563",fontFamily:"'Noto Sans KR',sans-serif"}}>
    분석 중...
    <div style={{display:"flex",gap:6,justifyContent:"center",marginTop:14}}>
      {[0,1,2].map(i=><div key={i} style={{width:7,height:7,borderRadius:"50%",background:"#6366f1",animation:`pulse 1.2s ${i*0.2}s infinite`}}/>)}
    </div>
  </div>;
}



// ── 타임테이블 ─────────────────────────────────────────────────────────────────
function Timetable({data,setData}) {
  const [date,setDate]=useState(todayStr());
  const [painting,setPainting]=useState(false);
  const [paintSubject,setPaintSubject]=useState("수학");
  const [erasing,setErasing]=useState(false);
  const [dragging,setDragging]=useState(false);
  const [showPlan,setShowPlan]=useState(false);
  const [plan,setPlan]=useState("");

  const daySlots = data.timetable[date]||{};
  const totalMins = calcMinutes(daySlots);
  const subMins = calcSubjectMinutes(daySlots);

  useEffect(()=>{ setPlan(data.plans[date]||""); },[date,data.plans]);

  function paint(slotIdx) {
    setData(d=>{
      const tt={...d.timetable};
      const day={...(tt[date]||{})};
      if(erasing) delete day[slotIdx];
      else day[slotIdx]=paintSubject;
      tt[date]=day;
      return {...d,timetable:tt};
    });
  }

  function handleSlotDown(slotIdx) { setDragging(true); paint(slotIdx); }
  function handleSlotEnter(slotIdx) { if(dragging) paint(slotIdx); }
  function handleUp() { setDragging(false); }

  function savePlan() {
    setData(d=>({...d,plans:{...d.plans,[date]:plan}}));
    setShowPlan(false);
  }

  function clearDay() {
    if(!confirm("이 날 기록을 전부 지울까?"))return;
    setData(d=>{const tt={...d.timetable};delete tt[date];return {...d,timetable:tt};});
  }

  // Hour labels
  const hours = Array.from({length:TOTAL_HOURS},(_,i)=>(START_HOUR+i)%24);

  return (
    <div>
      {/* 상단 컨트롤 */}
      <div style={{display:"flex",gap:8,alignItems:"center",marginBottom:"1rem",flexWrap:"wrap"}}>
        <input type="date" value={date} onChange={e=>setDate(e.target.value)}
          style={{...inp,width:"auto",padding:"0.38rem 0.7rem",fontSize:"0.82rem"}}/>
        <div style={{display:"flex",gap:4,background:"#0a0c12",border:"1px solid #1e2230",borderRadius:8,padding:3}}>
          <button onClick={()=>setErasing(false)} style={{padding:"0.32rem 0.7rem",borderRadius:5,border:"none",cursor:"pointer",
            background:!erasing?"#6366f1":"transparent",color:!erasing?"white":"#4b5563",
            fontFamily:"'Noto Sans KR',sans-serif",fontSize:"0.75rem",fontWeight:700}}>칠하기</button>
          <button onClick={()=>setErasing(true)} style={{padding:"0.32rem 0.7rem",borderRadius:5,border:"none",cursor:"pointer",
            background:erasing?"#ef4444":"transparent",color:erasing?"white":"#4b5563",
            fontFamily:"'Noto Sans KR',sans-serif",fontSize:"0.75rem",fontWeight:700}}>지우기</button>
        </div>
        <Btn small outline color="#f59e0b" onClick={()=>setShowPlan(true)}>계획 메모</Btn>
        <Btn small outline color="#4b5563" onClick={clearDay}>초기화</Btn>
      </div>

      {/* 과목 팔레트 */}
      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:"1rem"}}>
        {SUBJECTS.map(sub=>{
          const c=SUBJECT_COLORS[sub];
          const mins=subMins[sub]||0;
          return (
            <button key={sub} onClick={()=>{setPaintSubject(sub);setErasing(false);}} style={{
              padding:"0.3rem 0.75rem",borderRadius:8,border:`2px solid ${paintSubject===sub&&!erasing?c?.bg:"transparent"}`,
              background:c?.light,color:c?.text,fontFamily:"'Noto Sans KR',sans-serif",
              fontSize:"0.75rem",fontWeight:700,cursor:"pointer",
              boxShadow:paintSubject===sub&&!erasing?`0 0 12px ${c?.bg}60`:undefined
            }}>
              {sub}{mins>0?` ${Math.floor(mins/60)?Math.floor(mins/60)+"h":""}${mins%60?mins%60+"m":""}`.trim():""}
            </button>
          );
        })}
      </div>

      {/* 오늘 총합 */}
      <div style={{display:"flex",gap:10,marginBottom:"1rem",flexWrap:"wrap"}}>
        <div style={{background:"#0a0c12",border:"1px solid #1e2230",borderRadius:10,padding:"0.6rem 1rem"}}>
          <span style={{color:"#4b5563",fontSize:"0.68rem",fontFamily:"'Noto Sans KR',sans-serif"}}>오늘 총 </span>
          <span style={{color:"#6366f1",fontSize:"1rem",fontWeight:800,fontFamily:"'JetBrains Mono',monospace"}}>{Math.floor(totalMins/60)}h {totalMins%60}m</span>
        </div>
        {data.plans[date]&&<div style={{background:"#f59e0b12",border:"1px solid #f59e0b30",borderRadius:10,padding:"0.6rem 1rem",flex:1}}>
          <span style={{color:"#f59e0b",fontSize:"0.75rem",fontFamily:"'Noto Sans KR',sans-serif"}}>📋 {data.plans[date].slice(0,50)}{data.plans[date].length>50?"...":""}</span>
        </div>}
      </div>

      {/* 타임테이블 그리드 — 세로:시간(06~05), 가로:10분단위(0~50분) */}
      <div style={{background:"#0a0c12",border:"1px solid #1e2230",borderRadius:14,overflow:"auto",userSelect:"none"}}
        onMouseLeave={handleUp} onMouseUp={handleUp} onTouchEnd={handleUp}>
        <div style={{display:"flex",flexDirection:"column",minWidth:36+SLOTS_PER_HOUR*44}}>
          {/* 분 헤더 (가로: :00 :10 :20 :30 :40 :50) */}
          <div style={{display:"flex",borderBottom:"2px solid #1e2230",background:"#0a0c12",position:"sticky",top:0,zIndex:10}}>
            <div style={{width:44,flexShrink:0}}/>
            {Array.from({length:SLOTS_PER_HOUR},(_,mi)=>(
              <div key={mi} style={{width:44,flexShrink:0,textAlign:"center",padding:"0.28rem 0",borderLeft:"1px solid #1e2230"}}>
                <span style={{color:"#4b5563",fontSize:"0.6rem",fontFamily:"'JetBrains Mono',monospace"}}>:{String(mi*10).padStart(2,"0")}</span>
              </div>
            ))}
          </div>
          {/* 시간 행들 (세로: 06, 07, ... 05) */}
          {hours.map((h,hi)=>(
            <div key={h} style={{display:"flex",borderBottom:hi<hours.length-1?"1px solid #111318":"none"}}>
              {/* 시간 라벨 */}
              <div style={{width:44,flexShrink:0,display:"flex",alignItems:"center",justifyContent:"center",
                borderRight:"1px solid #1e2230",background:"#0a0c12"}}>
                <span style={{color:"#4b5563",fontSize:"0.62rem",fontFamily:"'JetBrains Mono',monospace",fontWeight:700}}>{String(h).padStart(2,"0")}시</span>
              </div>
              {/* 그 시간의 10분 슬롯 6개 */}
              {Array.from({length:SLOTS_PER_HOUR},(_,mi)=>{
                const si=hi*SLOTS_PER_HOUR+mi;
                const sub=daySlots[si];
                const c=sub?SUBJECT_COLORS[sub]:null;
                return (
                  <div key={mi}
                    onMouseDown={()=>handleSlotDown(si)}
                    onMouseEnter={()=>handleSlotEnter(si)}
                    onTouchStart={e=>{e.preventDefault();handleSlotDown(si);}}
                    onTouchMove={e=>{
                      e.preventDefault();
                      const t=e.touches[0];
                      const el=document.elementFromPoint(t.clientX,t.clientY);
                      if(el?.dataset?.slot)handleSlotEnter(Number(el.dataset.slot));
                    }}
                    data-slot={si}
                    style={{width:44,height:32,flexShrink:0,cursor:"crosshair",
                      background:sub?c?.bg+"e0":"transparent",
                      borderLeft:"1px solid #1a1d27",
                      position:"relative",transition:"background 0.04s"}}>
                    {sub&&mi===0&&(
                      <span style={{position:"absolute",left:2,top:2,fontSize:"0.53rem",color:"white",
                        fontFamily:"'Noto Sans KR',sans-serif",pointerEvents:"none",
                        whiteSpace:"nowrap",overflow:"hidden",maxWidth:40,opacity:0.9}}>{sub}</span>
                    )}
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      </div>

      {/* 계획 모달 */}
      {showPlan&&(
        <Modal title={`📋 ${date} 계획`} onClose={()=>setShowPlan(false)}>
          <textarea value={plan} onChange={e=>setPlan(e.target.value)} rows={8}
            style={{...inp,resize:"vertical",marginBottom:"1rem"}}
            placeholder={`오늘의 목표와 계획을 자유롭게 써줘.\n\n예:\n- 수학: 미적분 p.120~150\n- 국어: 문학 지문 5개\n- 한국사: 근현대사 백지 구조화`}/>
          <Btn full color="#f59e0b" onClick={savePlan}>저장</Btn>
        </Modal>
      )}
    </div>
  );
}

// ── 계획 시스템 ────────────────────────────────────────────────────────────────
// 계획 아이템: { id, date, subject, content, difficulty, focusTarget, status, note }
// status: "todo" | "done" | "failed"
const DIFFICULTY_LABEL = ["","매우쉬움","쉬움","보통","어려움","매우어려움"];
const DIFFICULTY_COLOR = ["","#22c55e","#84cc16","#f59e0b","#f97316","#ef4444"];
const FOCUS_LABEL = ["","최저","낮음","보통","높음","최고"];

function nextDay(dateStr) {
  const d = new Date(dateStr); d.setDate(d.getDate()+1);
  return d.toISOString().slice(0,10);
}

function PlanForm({onSave, onClose, editData, defaultDate}) {
  const [date,setDate]=useState(editData?.date||defaultDate||todayStr());
  const [subject,setSubject]=useState(editData?.subject||"수학");
  const [content,setContent]=useState(editData?.content||"");
  const [difficulty,setDifficulty]=useState(editData?.difficulty||3);
  const [focusTarget,setFocusTarget]=useState(editData?.focusTarget||3);
  const [note,setNote]=useState(editData?.note||"");
  const [elsTracks,setElsTracks]=useState(editData?.elsTracks||[]);

  function toggleTrack(key){
    setElsTracks(t=>t.includes(key)?t.filter(x=>x!==key):[...t,key]);
  }

  return (
    <Modal title={editData?"계획 수정":"계획 추가"} onClose={onClose}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:"0.9rem"}}>
        <div>
          <div style={{color:"#4b5563",fontSize:"0.68rem",marginBottom:4,fontFamily:"'Noto Sans KR',sans-serif",textTransform:"uppercase",letterSpacing:"0.06em"}}>날짜</div>
          <input type="date" value={date} onChange={e=>setDate(e.target.value)} style={inp}/>
        </div>
        <div>
          <div style={{color:"#4b5563",fontSize:"0.68rem",marginBottom:4,fontFamily:"'Noto Sans KR',sans-serif",textTransform:"uppercase",letterSpacing:"0.06em"}}>과목</div>
          <select value={subject} onChange={e=>setSubject(e.target.value)} style={inp}>
            {SUBJECTS.map(s=><option key={s}>{s}</option>)}
            <option value="기타">기타</option>
          </select>
        </div>
      </div>
      <div style={{marginBottom:"0.9rem"}}>
        <div style={{color:"#4b5563",fontSize:"0.68rem",marginBottom:4,fontFamily:"'Noto Sans KR',sans-serif",textTransform:"uppercase",letterSpacing:"0.06em"}}>할 내용</div>
        <textarea value={content} onChange={e=>setContent(e.target.value)} rows={3}
          style={{...inp,resize:"vertical"}} placeholder="예: 수학의 정석 미적분 p.120~150 풀기"/>
      </div>

      {/* ELS 계열 선택 (1~5개) */}
      <div style={{marginBottom:"0.9rem"}}>
        <div style={{color:"#4b5563",fontSize:"0.68rem",marginBottom:6,fontFamily:"'Noto Sans KR',sans-serif",textTransform:"uppercase",letterSpacing:"0.06em"}}>이 계획에 쓸 ELS 계열 (선택)</div>
        <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
          {ELS_TRACKS.map(track=>{
            const on=elsTracks.includes(track.key);
            return (
              <button key={track.key} onClick={()=>toggleTrack(track.key)} style={{
                padding:"0.3rem 0.7rem",borderRadius:8,cursor:"pointer",
                border:`1.5px solid ${on?track.color:track.color+"35"}`,
                background:on?track.color+"22":"transparent",
                color:on?track.color:track.color+"90",
                fontFamily:"'Noto Sans KR',sans-serif",fontSize:"0.76rem",fontWeight:700
              }}>{track.label}</button>
            );
          })}
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:10,marginBottom:"0.9rem"}}>
        <div>
          <div style={{color:"#4b5563",fontSize:"0.68rem",marginBottom:6,fontFamily:"'Noto Sans KR',sans-serif",textTransform:"uppercase",letterSpacing:"0.06em"}}>난이도 — <span style={{color:DIFFICULTY_COLOR[difficulty]}}>{DIFFICULTY_LABEL[difficulty]}</span></div>
          <input type="range" min={1} max={5} value={difficulty} onChange={e=>setDifficulty(Number(e.target.value))}
            style={{width:"100%",accentColor:DIFFICULTY_COLOR[difficulty]}}/>
        </div>
        <div>
          <div style={{color:"#4b5563",fontSize:"0.68rem",marginBottom:6,fontFamily:"'Noto Sans KR',sans-serif",textTransform:"uppercase",letterSpacing:"0.06em"}}>목표 집중도 — <span style={{color:"#6366f1"}}>{FOCUS_LABEL[focusTarget]}</span></div>
          <input type="range" min={1} max={5} value={focusTarget} onChange={e=>setFocusTarget(Number(e.target.value))}
            style={{width:"100%",accentColor:"#6366f1"}}/>
        </div>
      </div>
      <div style={{marginBottom:"1.2rem"}}>
        <div style={{color:"#4b5563",fontSize:"0.68rem",marginBottom:4,fontFamily:"'Noto Sans KR',sans-serif",textTransform:"uppercase",letterSpacing:"0.06em"}}>메모 (선택)</div>
        <input value={note} onChange={e=>setNote(e.target.value)} style={inp} placeholder="참고사항, 목표 범위 등"/>
      </div>
      <Btn full onClick={()=>{
        if(!content.trim())return;
        onSave({id:editData?.id||Date.now(),date,subject,content,difficulty,focusTarget,note,elsTracks,status:"todo"});
        onClose();
      }}>저장</Btn>
    </Modal>
  );
}

function PlanCard({plan,onStatus,onEdit,onDelete}) {
  const c=SUBJECT_COLORS[plan.subject];
  const statusStyle = {
    todo:  {bg:"#1e2230", color:"#6b7280", label:"예정"},
    done:  {bg:"#22c55e20", color:"#22c55e", label:"✅ 완료"},
    failed:{bg:"#ef444420", color:"#ef4444", label:"❌ 실패"},
  }[plan.status]||{bg:"#1e2230",color:"#6b7280",label:"예정"};

  return (
    <div style={{background:"#0a0c12",border:`1px solid ${plan.status==="done"?"#22c55e30":plan.status==="failed"?"#ef444430":"#1e2230"}`,
      borderRadius:11,padding:"0.85rem 1rem",marginBottom:6,opacity:plan.status==="done"?0.7:1}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
        <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
          <span style={{color:c?.text||"#a5b4fc",fontWeight:800,fontSize:"0.82rem",fontFamily:"'Noto Sans KR',sans-serif"}}>{plan.subject}</span>
          <span style={{background:statusStyle.bg,color:statusStyle.color,fontSize:"0.7rem",padding:"0.12rem 0.5rem",borderRadius:99,fontFamily:"'Noto Sans KR',sans-serif",fontWeight:700}}>{statusStyle.label}</span>
          {plan.difficulty&&<span style={{color:DIFFICULTY_COLOR[plan.difficulty],fontSize:"0.68rem",fontFamily:"'Noto Sans KR',sans-serif"}}>난이도 {DIFFICULTY_LABEL[plan.difficulty]}</span>}
          {plan.focusTarget&&<span style={{color:"#6366f1",fontSize:"0.68rem",fontFamily:"'Noto Sans KR',sans-serif"}}>집중 목표 {FOCUS_LABEL[plan.focusTarget]}</span>}
        </div>
        <div style={{display:"flex",gap:5,flexShrink:0}}>
          <button onClick={()=>onEdit(plan)} style={{background:"none",border:"none",color:"#4b5563",cursor:"pointer",fontSize:"0.7rem",fontFamily:"'Noto Sans KR',sans-serif"}}>수정</button>
          <button onClick={()=>onDelete(plan.id)} style={{background:"none",border:"none",color:"#2d3241",cursor:"pointer",fontSize:"0.82rem"}}>×</button>
        </div>
      </div>
      <div style={{color:plan.status==="done"?"#4b5563":"#d1d5db",fontSize:"0.82rem",fontFamily:"'Noto Sans KR',sans-serif",lineHeight:1.6,marginBottom:6,textDecoration:plan.status==="done"?"line-through":"none"}}>{plan.content}</div>
      {plan.elsTracks&&plan.elsTracks.length>0&&(
        <div style={{display:"flex",gap:4,flexWrap:"wrap",marginBottom:plan.note?6:8}}>
          {plan.elsTracks.map(tk=>{
            const track=ELS_TRACKS.find(t=>t.key===tk);
            if(!track)return null;
            return <span key={tk} style={{background:track.color+"18",color:track.color,fontSize:"0.65rem",padding:"0.1rem 0.45rem",borderRadius:99,fontFamily:"'Noto Sans KR',sans-serif",fontWeight:700}}>{track.label}</span>;
          })}
        </div>
      )}
      {plan.note&&<div style={{color:"#4b5563",fontSize:"0.72rem",fontFamily:"'Noto Sans KR',sans-serif",marginBottom:8}}>📌 {plan.note}</div>}
      {/* 상태 버튼 */}
      {plan.status==="todo"&&(
        <div style={{display:"flex",gap:6}}>
          <button onClick={()=>onStatus(plan.id,"done")} style={{flex:1,padding:"0.35rem",borderRadius:7,border:"1px solid #22c55e40",background:"#22c55e15",color:"#22c55e",fontFamily:"'Noto Sans KR',sans-serif",fontSize:"0.75rem",fontWeight:700,cursor:"pointer"}}>✅ 완료</button>
          <button onClick={()=>onStatus(plan.id,"failed")} style={{flex:1,padding:"0.35rem",borderRadius:7,border:"1px solid #ef444440",background:"#ef444415",color:"#ef4444",fontFamily:"'Noto Sans KR',sans-serif",fontSize:"0.75rem",fontWeight:700,cursor:"pointer"}}>❌ 실패 → 내일로</button>
        </div>
      )}
      {plan.status==="failed"&&(
        <div style={{color:"#ef4444",fontSize:"0.7rem",fontFamily:"'Noto Sans KR',sans-serif"}}>→ {nextDay(plan.date)}로 이동됨</div>
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
        <div style={{color:"#4b5563",fontSize:"0.68rem",marginBottom:4,fontFamily:"'Noto Sans KR',sans-serif",textTransform:"uppercase",letterSpacing:"0.06em"}}>과목</div>
        <select value={subject} onChange={e=>setSubject(e.target.value)} style={inp}>
          {SUBJECTS.map(s=><option key={s}>{s}</option>)}
          <option value="기타">기타</option>
          <option value="전체">전체 (과목 무관)</option>
        </select>
      </div>
      <div style={{marginBottom:"0.9rem"}}>
        <div style={{color:"#4b5563",fontSize:"0.68rem",marginBottom:4,fontFamily:"'Noto Sans KR',sans-serif",textTransform:"uppercase",letterSpacing:"0.06em"}}>{scopeLabel} 목표 내용</div>
        <textarea value={content} onChange={e=>setContent(e.target.value)} rows={3}
          style={{...inp,resize:"vertical"}} placeholder={scope==="week" ? "예: 수학 오답노트 XC 유형 전부 재풀이" : "예: 국어 문학 개념 단권화 완성"}/>
      </div>
      <div style={{marginBottom:"0.9rem"}}>
        <div style={{color:"#4b5563",fontSize:"0.68rem",marginBottom:6,fontFamily:"'Noto Sans KR',sans-serif",textTransform:"uppercase",letterSpacing:"0.06em"}}>난이도 — <span style={{color:DIFFICULTY_COLOR[difficulty]}}>{DIFFICULTY_LABEL[difficulty]}</span></div>
        <input type="range" min={1} max={5} value={difficulty} onChange={e=>setDifficulty(Number(e.target.value))}
          style={{width:"100%",accentColor:DIFFICULTY_COLOR[difficulty]}}/>
      </div>
      <div style={{marginBottom:"1.2rem"}}>
        <div style={{color:"#4b5563",fontSize:"0.68rem",marginBottom:4,fontFamily:"'Noto Sans KR',sans-serif",textTransform:"uppercase",letterSpacing:"0.06em"}}>메모 (선택)</div>
        <input value={note} onChange={e=>setNote(e.target.value)} style={inp} placeholder="세부 기준, 참고사항 등"/>
      </div>
      <Btn full onClick={()=>{
        if(!content.trim())return;
        onSave({id:editData?.id||Date.now(),scope,scopeKey,subject,content,difficulty,note,status:"todo"});
        onClose();
      }}>저장</Btn>
      {editData&&(
        <div style={{color:"#4b5563",fontSize:"0.68rem",marginTop:8,textAlign:"center",fontFamily:"'Noto Sans KR',sans-serif"}}>이 목표는 삭제하려면 목록에서 × 버튼을 눌러줘</div>
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
          <span style={{color:c?.text,fontWeight:800,fontSize:"0.8rem",fontFamily:"'Noto Sans KR',sans-serif"}}>{goal.subject}</span>
          <span style={{background:statusStyle.bg,color:statusStyle.color,fontSize:"0.68rem",padding:"0.1rem 0.45rem",borderRadius:99,fontFamily:"'Noto Sans KR',sans-serif",fontWeight:700}}>{statusStyle.label}</span>
          {goal.difficulty&&<span style={{color:DIFFICULTY_COLOR[goal.difficulty],fontSize:"0.66rem",fontFamily:"'Noto Sans KR',sans-serif"}}>난이도 {DIFFICULTY_LABEL[goal.difficulty]}</span>}
        </div>
        <div style={{display:"flex",gap:5,flexShrink:0}}>
          <button onClick={()=>onEdit(goal)} style={{background:"none",border:"none",color:"#4b5563",cursor:"pointer",fontSize:"0.68rem",fontFamily:"'Noto Sans KR',sans-serif"}}>수정</button>
          <button onClick={()=>onDelete(goal.id)} style={{background:"none",border:"none",color:"#2d3241",cursor:"pointer",fontSize:"0.8rem"}}>×</button>
        </div>
      </div>
      <div style={{color:goal.status==="done"?"#4b5563":"#d1d5db",fontSize:"0.8rem",fontFamily:"'Noto Sans KR',sans-serif",lineHeight:1.6,marginBottom:goal.note?5:6,textDecoration:goal.status==="done"?"line-through":"none"}}>{goal.content}</div>
      {goal.note&&<div style={{color:"#4b5563",fontSize:"0.7rem",fontFamily:"'Noto Sans KR',sans-serif",marginBottom:6}}>📌 {goal.note}</div>}
      {goal.status==="todo"&&(
        <button onClick={()=>onStatus(goal.id,"done")} style={{width:"100%",padding:"0.32rem",borderRadius:7,border:"1px solid #22c55e40",background:"#22c55e15",color:"#22c55e",fontFamily:"'Noto Sans KR',sans-serif",fontSize:"0.72rem",fontWeight:700,cursor:"pointer"}}>✅ 달성 완료</button>
      )}
      {goal.status==="done"&&(
        <button onClick={()=>onStatus(goal.id,"todo")} style={{width:"100%",padding:"0.32rem",borderRadius:7,border:"1px solid #2a2d3a",background:"transparent",color:"#4b5563",fontFamily:"'Noto Sans KR',sans-serif",fontSize:"0.72rem",cursor:"pointer"}}>되돌리기</button>
      )}
    </div>
  );
}

function PlanSystem({data,setData}) {
  const [viewMode,setViewMode]=useState("day"); // day | week | month
  const [date,setDate]=useState(todayStr());
  const [modal,setModal]=useState(null); // "add" | editPlan
  const [editPlan,setEditPlan]=useState(null);
  const [year,setYear]=useState(new Date().getFullYear());
  const [month,setMonth]=useState(new Date().getMonth());

  const plans = data.plans2||[];

  function savePlan(p) {
    setData(d=>{
      const list=[...(d.plans2||[])];
      const idx=list.findIndex(x=>x.id===p.id);
      if(idx>=0) list[idx]=p; else list.push(p);
      return {...d,plans2:list};
    });
  }

  function deletePlan(id) {
    setData(d=>({...d,plans2:(d.plans2||[]).filter(p=>p.id!==id)}));
  }

  function setStatus(id, status) {
    setData(d=>{
      const list=[...(d.plans2||[])];
      const idx=list.findIndex(x=>x.id===id);
      if(idx<0)return d;
      const plan={...list[idx],status};
      list[idx]=plan;
      // 실패시 다음날로 복사
      if(status==="failed"){
        const tomorrow=nextDay(plan.date);
        const alreadyMoved=list.some(p=>p.id===plan.id+"_moved_"+tomorrow);
        if(!alreadyMoved){
          list.push({...plan,id:plan.id+"_moved_"+tomorrow,date:tomorrow,status:"todo",note:(plan.note?"[이월] ":"")+plan.content.slice(0,20)+"... (어제 실패)"});
        }
      }
      return {...d,plans2:list};
    });
  }

  // 일간
  const dayPlans=plans.filter(p=>p.date===date).sort((a,b)=>a.subject.localeCompare(b.subject));
  const dayDone=dayPlans.filter(p=>p.status==="done").length;
  const dayFailed=dayPlans.filter(p=>p.status==="failed").length;

  // 주간 (현재 날짜 기준 월~일)
  function getWeekDates(d) {
    const dt=new Date(d);
    const day=dt.getDay();
    const mon=new Date(dt); mon.setDate(dt.getDate()-(day===0?6:day-1));
    return Array.from({length:7},(_,i)=>{ const x=new Date(mon);x.setDate(mon.getDate()+i);return x.toISOString().slice(0,10); });
  }
  const weekDates=getWeekDates(date);
  const DAY_KO=["월","화","수","목","금","토","일"];

  // 월간
  const MONTH_KO=["1월","2월","3월","4월","5월","6월","7월","8월","9월","10월","11월","12월"];
  function monthDateStr(d){return `${year}-${String(month+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;}
  const firstDay=new Date(year,month,1).getDay();
  const daysInMonth=new Date(year,month+1,0).getDate();
  const calCells=[];
  for(let i=0;i<(firstDay===0?6:firstDay-1);i++)calCells.push(null);
  for(let d=1;d<=daysInMonth;d++)calCells.push(d);

  return (
    <div>
      {/* 뷰 전환 + 날짜 */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"1rem",flexWrap:"wrap",gap:8}}>
        <div style={{display:"flex",gap:3,background:"#0a0c12",border:"1px solid #1e2230",borderRadius:8,padding:3}}>
          {[["day","일간"],["week","주간"],["month","월간"]].map(([v,l])=>(
            <button key={v} onClick={()=>setViewMode(v)} style={{padding:"0.32rem 0.8rem",borderRadius:5,border:"none",cursor:"pointer",
              background:viewMode===v?"#6366f1":"transparent",color:viewMode===v?"white":"#4b5563",
              fontFamily:"'Noto Sans KR',sans-serif",fontSize:"0.76rem",fontWeight:700}}>{l}</button>
          ))}
        </div>
        {viewMode!=="month"&&<input type="date" value={date} onChange={e=>setDate(e.target.value)}
          style={{...inp,width:"auto",padding:"0.35rem 0.65rem",fontSize:"0.8rem"}}/>}
        {viewMode==="month"&&(
          <div style={{display:"flex",alignItems:"center",gap:8}}>
            <button onClick={()=>{if(month===0){setMonth(11);setYear(y=>y-1);}else setMonth(m=>m-1);}} style={{background:"none",border:"none",color:"#6b7280",cursor:"pointer",fontSize:"1.1rem"}}>‹</button>
            <span style={{color:"#f1f3f9",fontWeight:700,fontSize:"0.9rem",fontFamily:"'Noto Sans KR',sans-serif"}}>{year}년 {MONTH_KO[month]}</span>
            <button onClick={()=>{if(month===11){setMonth(0);setYear(y=>y+1);}else setMonth(m=>m+1);}} style={{background:"none",border:"none",color:"#6b7280",cursor:"pointer",fontSize:"1.1rem"}}>›</button>
          </div>
        )}
        <Btn small color="#6366f1" onClick={()=>{setEditPlan(null);setModal("add");}}>+ 계획 추가</Btn>
      </div>

      {/* 일간 뷰 */}
      {viewMode==="day"&&(
        <div>
          <div style={{display:"flex",gap:8,marginBottom:"1rem",flexWrap:"wrap"}}>
            {[
              [`총 ${dayPlans.length}개`,"#6b7280"],
              [`완료 ${dayDone}개`,"#22c55e"],
              [`실패 ${dayFailed}개`,"#ef4444"],
              [`예정 ${dayPlans.filter(p=>p.status==="todo").length}개`,"#6366f1"],
            ].map(([v,c])=>(
              <div key={v} style={{background:"#0a0c12",border:"1px solid #1e2230",borderRadius:9,padding:"0.5rem 0.85rem"}}>
                <span style={{color:c,fontSize:"0.82rem",fontWeight:700,fontFamily:"'Noto Sans KR',sans-serif"}}>{v}</span>
              </div>
            ))}
          </div>
          {dayPlans.length===0
            ?<div style={{color:"#2d3241",fontSize:"0.85rem",textAlign:"center",padding:"3rem 0",fontFamily:"'Noto Sans KR',sans-serif"}}>이 날 계획 없음 — + 계획 추가로 시작해봐</div>
            :dayPlans.map(p=><PlanCard key={p.id} plan={p} onStatus={setStatus} onEdit={p=>{setEditPlan(p);setModal("edit");}} onDelete={deletePlan}/>)
          }
        </div>
      )}

      {/* 주간 뷰 */}
      {viewMode==="week"&&(
        <div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:4,marginBottom:"1rem"}}>
            {weekDates.map((d,i)=>{
              const dp=plans.filter(p=>p.date===d);
              const done=dp.filter(p=>p.status==="done").length;
              const failed=dp.filter(p=>p.status==="failed").length;
              const isToday=d===todayStr();
              return (
                <div key={d} onClick={()=>{setDate(d);setViewMode("day");}} style={{
                  background:d===date?"#1e2230":"#0a0c12",
                  border:`1px solid ${isToday?"#6366f1":"#1e2230"}`,
                  borderRadius:10,padding:"0.6rem 0.3rem",cursor:"pointer",textAlign:"center",minHeight:80
                }}>
                  <div style={{color:isToday?"#6366f1":"#4b5563",fontSize:"0.68rem",fontFamily:"'Noto Sans KR',sans-serif",marginBottom:2}}>{DAY_KO[i]}</div>
                  <div style={{color:"#9ca3af",fontSize:"0.65rem",fontFamily:"'JetBrains Mono',monospace",marginBottom:5}}>{d.slice(5)}</div>
                  {dp.length>0&&<>
                    <div style={{color:"#f1f3f9",fontSize:"0.9rem",fontWeight:800,fontFamily:"'JetBrains Mono',monospace",lineHeight:1}}>{dp.length}</div>
                    <div style={{fontSize:"0.6rem",marginTop:3,fontFamily:"'Noto Sans KR',sans-serif"}}>
                      {done>0&&<span style={{color:"#22c55e"}}>✅{done} </span>}
                      {failed>0&&<span style={{color:"#ef4444"}}>❌{failed}</span>}
                    </div>
                    <div style={{display:"flex",gap:2,justifyContent:"center",marginTop:4,flexWrap:"wrap"}}>
                      {[...new Set(dp.map(p=>p.subject))].slice(0,4).map(s=>(
                        <div key={s} style={{width:6,height:6,borderRadius:"50%",background:SUBJECT_COLORS[s]?.bg||"#6366f1"}}/>
                      ))}
                    </div>
                  </>}
                </div>
              );
            })}
          </div>
          {/* 주간 전체 계획 목록 */}
          {weekDates.map(d=>{
            const dp=plans.filter(p=>p.date===d);
            if(dp.length===0)return null;
            return (
              <div key={d} style={{marginBottom:10}}>
                <div style={{color:"#6b7280",fontSize:"0.72rem",fontFamily:"'JetBrains Mono',monospace",marginBottom:5,paddingLeft:4}}>{d} ({DAY_KO[weekDates.indexOf(d)]})</div>
                {dp.map(p=><PlanCard key={p.id} plan={p} onStatus={setStatus} onEdit={p=>{setEditPlan(p);setModal("edit");}} onDelete={deletePlan}/>)}
              </div>
            );
          })}
        </div>
      )}

      {/* 월간 뷰 */}
      {viewMode==="month"&&(
        <div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2,marginBottom:4}}>
            {["월","화","수","목","금","토","일"].map((d,i)=>(
              <div key={d} style={{textAlign:"center",color:i===5?"#8b5cf6":i===6?"#ef4444":"#4b5563",
                fontSize:"0.68rem",fontFamily:"'Noto Sans KR',sans-serif",fontWeight:700,padding:"0.25rem 0"}}>{d}</div>
            ))}
          </div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2}}>
            {calCells.map((d,i)=>{
              if(!d)return <div key={`e${i}`}/>;
              const ds=monthDateStr(d);
              const dp=plans.filter(p=>p.date===ds);
              const done=dp.filter(p=>p.status==="done").length;
              const failed=dp.filter(p=>p.status==="failed").length;
              const isToday=ds===todayStr();
              return (
                <div key={d} onClick={()=>{setDate(ds);setViewMode("day");}} style={{
                  background:isToday?"#1e2230":"#0a0c12",
                  border:`1px solid ${isToday?"#6366f1":"#1e2230"}`,
                  borderRadius:8,padding:"0.4rem 0.25rem",cursor:"pointer",
                  minHeight:54,display:"flex",flexDirection:"column",alignItems:"center",gap:2
                }}>
                  <span style={{color:isToday?"#6366f1":i%7===6?"#ef4444":i%7===5?"#8b5cf6":"#9ca3af",
                    fontSize:"0.75rem",fontWeight:isToday?800:400,fontFamily:"'JetBrains Mono',monospace"}}>{d}</span>
                  {dp.length>0&&<>
                    <span style={{color:"#f1f3f9",fontSize:"0.7rem",fontWeight:700,fontFamily:"'JetBrains Mono',monospace"}}>{dp.length}개</span>
                    <div style={{fontSize:"0.58rem"}}>
                      {done>0&&<span style={{color:"#22c55e"}}>✅{done}</span>}
                      {failed>0&&<span style={{color:"#ef4444"}}> ❌{failed}</span>}
                    </div>
                  </>}
                </div>
              );
            })}
          </div>

          {/* 월간 통계 */}
          <div style={{marginTop:"1.2rem",background:"#0a0c12",border:"1px solid #1e2230",borderRadius:12,padding:"1.1rem"}}>
            <div style={{color:"#4b5563",fontSize:"0.68rem",textTransform:"uppercase",letterSpacing:"0.07em",fontFamily:"'Noto Sans KR',sans-serif",marginBottom:10}}>이번 달 계획 통계</div>
            {(()=>{
              const mp=plans.filter(p=>p.date.startsWith(`${year}-${String(month+1).padStart(2,"0")}`));
              const done=mp.filter(p=>p.status==="done").length;
              const failed=mp.filter(p=>p.status==="failed").length;
              const todo=mp.filter(p=>p.status==="todo").length;
              const rate=mp.length>0?Math.round((done/mp.length)*100):0;
              return (
                <div style={{display:"flex",gap:12,flexWrap:"wrap"}}>
                  {[["총 계획",mp.length,"#6b7280"],["완료",done,"#22c55e"],["실패",failed,"#ef4444"],["예정",todo,"#6366f1"],["달성률",rate+"%","#f59e0b"]].map(([l,v,c])=>(
                    <div key={l} style={{textAlign:"center"}}>
                      <div style={{color:c,fontSize:"1.2rem",fontWeight:800,fontFamily:"'JetBrains Mono',monospace",lineHeight:1}}>{v}</div>
                      <div style={{color:"#4b5563",fontSize:"0.65rem",fontFamily:"'Noto Sans KR',sans-serif",marginTop:2}}>{l}</div>
                    </div>
                  ))}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {/* 모달 */}
      {(modal==="add"||modal==="edit")&&(
        <PlanForm
          editData={modal==="edit"?editPlan:null}
          defaultDate={date}
          onSave={p=>{savePlan(p);setModal(null);setEditPlan(null);}}
          onClose={()=>{setModal(null);setEditPlan(null);}}
        />
      )}
    </div>
  );
}

// ── 오답 등록 ──────────────────────────────────────────────────────────────────
function WrongForm({onSave,onClose,editData,onDelete}) {
  const [date,setDate]=useState(editData?.date||todayStr());
  const [subject,setSubject]=useState(editData?.subject||"수학");
  const [code,setCode]=useState(editData?.code||"XC");
  const [problem,setProblem]=useState(editData?.problem||"");
  const [cause,setCause]=useState(editData?.cause||"");
  const [fix,setFix]=useState(editData?.fix||"");
  const [photo,setPhoto]=useState(editData?.photo||null);
  const [answerText,setAnswerText]=useState(editData?.answerText||"");

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
          <div style={{color:"#4b5563",fontSize:"0.68rem",marginBottom:4,fontFamily:"'Noto Sans KR',sans-serif",textTransform:"uppercase",letterSpacing:"0.06em"}}>날짜</div>
          <input type="date" value={date} onChange={e=>setDate(e.target.value)} style={inp}/>
        </div>
        <div>
          <div style={{color:"#4b5563",fontSize:"0.68rem",marginBottom:4,fontFamily:"'Noto Sans KR',sans-serif",textTransform:"uppercase",letterSpacing:"0.06em"}}>과목</div>
          <select value={subject} onChange={e=>setSubject(e.target.value)} style={inp}>
            {SUBJECTS.map(s=><option key={s}>{s}</option>)}
          </select>
        </div>
      </div>

      {/* 오답 코드 — 대분류별로 묶어서 버튼 선택 */}
      <div style={{marginBottom:"0.9rem"}}>
        <div style={{color:"#4b5563",fontSize:"0.68rem",marginBottom:6,fontFamily:"'Noto Sans KR',sans-serif",textTransform:"uppercase",letterSpacing:"0.06em"}}>오답 코드</div>
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
        <div style={{color:ERROR_CODES[code]?.color||"#9ca3af",fontSize:"0.72rem",marginTop:6,fontFamily:"'Noto Sans KR',sans-serif"}}>
          <strong>{ERROR_CODES[code]?.desc||code}</strong>{ERROR_CODES[code]?.detail?` — ${ERROR_CODES[code].detail}`:""}
        </div>
      </div>

      <div style={{marginBottom:"0.9rem"}}>
        <div style={{color:"#4b5563",fontSize:"0.68rem",marginBottom:4,fontFamily:"'Noto Sans KR',sans-serif",textTransform:"uppercase",letterSpacing:"0.06em"}}>문제 번호/요약 (선택)</div>
        <input value={problem} onChange={e=>setProblem(e.target.value)} style={inp} placeholder="예: 3번, 함수 합성"/>
      </div>

      {/* 사진 */}
      <div style={{marginBottom:"0.9rem"}}>
        <div style={{color:"#4b5563",fontSize:"0.68rem",marginBottom:4,fontFamily:"'Noto Sans KR',sans-serif",textTransform:"uppercase",letterSpacing:"0.06em"}}>문제 사진 (선택)</div>
        <label style={{
          display:"inline-flex",alignItems:"center",gap:6,
          background:"#111318",border:"1px solid #1e2230",borderRadius:8,
          padding:"0.55rem 1rem",cursor:"pointer",
          color:"#9ca3af",fontFamily:"'Noto Sans KR',sans-serif",fontSize:"0.8rem",fontWeight:600
        }}>
          📷 {photo?"사진 변경":"사진 선택"}
          <input type="file" accept="image/*" onChange={e=>handlePhoto(e,setPhoto)} style={{display:"none"}}/>
        </label>
        {photo&&<div style={{marginTop:6,display:"flex",alignItems:"center",gap:8}}>
          <img src={photo} alt="미리보기" style={{height:60,borderRadius:6,border:"1px solid #1e2230",objectFit:"contain"}}/>
          <button onClick={()=>setPhoto(null)} style={{background:"none",border:"none",color:"#ef4444",cursor:"pointer",fontSize:"0.75rem",fontFamily:"'Noto Sans KR',sans-serif"}}>삭제</button>
        </div>}
      </div>

      {/* 정답 */}
      <div style={{marginBottom:"0.9rem"}}>
        <div style={{color:"#4b5563",fontSize:"0.68rem",marginBottom:4,fontFamily:"'Noto Sans KR',sans-serif",textTransform:"uppercase",letterSpacing:"0.06em"}}>정답 (선택 · 문제풀이 모드에서 '답 보기'로 확인)</div>
        <input value={answerText} onChange={e=>setAnswerText(e.target.value)} style={inp} placeholder="예: ③, x=3, '민중은 우매하다'는 인식 등"/>
      </div>

      <div style={{marginBottom:"0.9rem"}}>
        <div style={{color:"#4b5563",fontSize:"0.68rem",marginBottom:4,fontFamily:"'Noto Sans KR',sans-serif",textTransform:"uppercase",letterSpacing:"0.06em"}}>왜 틀렸나</div>
        <textarea value={cause} onChange={e=>setCause(e.target.value)} rows={3}
          style={{...inp,resize:"vertical"}} placeholder="어떤 사고 과정에서 어디가 틀렸는지"/>
      </div>

      <div style={{marginBottom:"1.2rem"}}>
        <div style={{color:"#4b5563",fontSize:"0.68rem",marginBottom:4,fontFamily:"'Noto Sans KR',sans-serif",textTransform:"uppercase",letterSpacing:"0.06em"}}>다음에 어떻게 할 건가</div>
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
          fontFamily:"'Noto Sans KR',sans-serif",fontSize:"0.8rem",fontWeight:700,cursor:"pointer"
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
        {wrongs.length===0&&<span style={{color:"#2d3241",fontSize:"0.82rem",fontFamily:"'Noto Sans KR',sans-serif"}}>아직 오답 없음</span>}
      </div>

      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"1rem",flexWrap:"wrap",gap:8}}>
        <div style={{display:"flex",gap:3,background:"#0a0c12",border:"1px solid #1e2230",borderRadius:8,padding:3}}>
          {[["folder","폴더"],["list","목록"]].map(([v,l])=>(
            <button key={v} onClick={()=>setViewMode(v)} style={{padding:"0.32rem 0.75rem",borderRadius:5,border:"none",cursor:"pointer",
              background:viewMode===v?"#6366f1":"transparent",color:viewMode===v?"white":"#4b5563",
              fontFamily:"'Noto Sans KR',sans-serif",fontSize:"0.76rem",fontWeight:700}}>{l}</button>
          ))}
        </div>
        <span style={{color:"#4b5563",fontSize:"0.75rem",fontFamily:"'Noto Sans KR',sans-serif"}}>총 {wrongs.length}개</span>
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
                        :<span style={{color:"#f1f3f9",fontWeight:800,fontSize:"0.9rem",fontFamily:"'Noto Sans KR',sans-serif"}}>{getName(sub)}</span>
                      }
                      <span style={{background:`${c?.bg}20`,color:c?.text,fontSize:"0.7rem",padding:"0.1rem 0.45rem",borderRadius:99,fontFamily:"'JetBrains Mono',monospace",fontWeight:700}}>{subEntries.length}</span>
                    </div>
                    <div style={{display:"flex",gap:8,alignItems:"center"}}>
                      <button onClick={e=>startRename(e,sub,getName(sub))} style={{background:"none",border:"none",color:"#4b5563",cursor:"pointer",fontSize:"0.68rem",fontFamily:"'Noto Sans KR',sans-serif"}}>수정</button>
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
                                  :<span style={{color:"#d1d5db",fontWeight:700,fontSize:"0.8rem",fontFamily:"'Noto Sans KR',sans-serif"}}>{getName(codeKey)}</span>
                                }
                                <Tag code={code}/>
                                <span style={{color:"#4b5563",fontSize:"0.68rem",fontFamily:"'JetBrains Mono',monospace"}}>{codeEntries.length}개</span>
                              </div>
                              <div style={{display:"flex",gap:6,alignItems:"center"}}>
                                {onPracticeGroup&&codeEntries.some(x=>x.photo&&!x.solved)&&(
                                  <button onClick={ev=>{ev.stopPropagation();onPracticeGroup(codeEntries.filter(x=>x.photo&&!x.solved));}}
                                    style={{background:"#6366f120",border:"1px solid #6366f140",borderRadius:6,color:"#818cf8",cursor:"pointer",fontSize:"0.65rem",fontFamily:"'Noto Sans KR',sans-serif",padding:"0.15rem 0.5rem",fontWeight:700}}>
                                    ✏️ 연속풀기 ({codeEntries.filter(x=>x.photo&&!x.solved).length})
                                  </button>
                                )}
                                {onPracticeGroup&&codeEntries.some(x=>x.photo)&&!codeEntries.some(x=>x.photo&&!x.solved)&&(
                                  <span style={{color:"#22c55e",fontSize:"0.62rem",fontFamily:"'Noto Sans KR',sans-serif"}}>✅ 전부 맞음</span>
                                )}
                                <button onClick={e=>startRename(e,codeKey,getName(codeKey))} style={{background:"none",border:"none",color:"#4b5563",cursor:"pointer",fontSize:"0.65rem",fontFamily:"'Noto Sans KR',sans-serif"}}>수정</button>
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
            <span style={{color:"#4b5563",fontSize:"0.78rem",fontFamily:"'Noto Sans KR',sans-serif",alignSelf:"center"}}>{filtered.length}개</span>
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
          <span style={{color:c?.text||"#a5b4fc",fontSize:"0.75rem",fontWeight:800,fontFamily:"'Noto Sans KR',sans-serif"}}>{e.subject}</span>
          <Tag code={e.code}/>
          {e.photo&&<span style={{fontSize:"0.7rem"}}>📷</span>}
          {e.solved&&<span style={{color:"#22c55e",fontSize:"0.68rem",fontFamily:"'Noto Sans KR',sans-serif",fontWeight:700,background:"#22c55e18",padding:"0.05rem 0.4rem",borderRadius:99}}>✅ 맞음</span>}
          {e.failCount>0&&<span style={{color:"#ef4444",fontSize:"0.68rem",fontFamily:"'JetBrains Mono',monospace",fontWeight:700}}>❌×{e.failCount}</span>}
          <span style={{color:"#6b7280",fontSize:"0.75rem",fontFamily:"'Noto Sans KR',sans-serif"}}>{e.problem||e.cause.slice(0,25)+(e.cause.length>25?"...":"")}</span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
          <span style={{color:"#2d3241",fontSize:"0.65rem",fontFamily:"'JetBrains Mono',monospace"}}>{e.date}</span>
          {e.photo&&onPractice&&<button onClick={ev=>{ev.stopPropagation();onPractice(e);}} style={{background:"#6366f120",border:"1px solid #6366f140",borderRadius:6,color:"#818cf8",cursor:"pointer",fontSize:"0.68rem",fontFamily:"'Noto Sans KR',sans-serif",padding:"0.15rem 0.5rem",fontWeight:700}}>✏️ 풀기</button>}
          <button onClick={ev=>{ev.stopPropagation();onEdit(e);}} style={{background:"none",border:"none",color:"#6366f1",cursor:"pointer",fontSize:"0.7rem",fontFamily:"'Noto Sans KR',sans-serif"}}>수정</button>
          <button onClick={ev=>{ev.stopPropagation();onDelete(e.id);}} style={{background:"none",border:"none",color:"#2d3241",cursor:"pointer",fontSize:"0.82rem"}}>×</button>
          <span style={{color:"#2d3241",fontSize:"0.7rem"}}>{open?"▲":"▼"}</span>
        </div>
      </div>
      {open&&(
        <div style={{padding:"0 0.9rem 0.85rem",borderTop:"1px solid #1a1d27"}}>
          {e.cause&&<div style={{color:"#9ca3af",fontSize:"0.8rem",fontFamily:"'Noto Sans KR',sans-serif",lineHeight:1.75,marginTop:8}}>{e.cause}</div>}
          {e.fix&&<div style={{color:"#10b981",fontSize:"0.76rem",fontFamily:"'Noto Sans KR',sans-serif",marginTop:5}}>→ {e.fix}</div>}
          {e.answerText&&<div style={{color:"#6366f1",fontSize:"0.76rem",fontFamily:"'Noto Sans KR',sans-serif",marginTop:5}}>정답: {e.answerText}</div>}
          {e.photo&&<img src={e.photo} alt="오답" style={{marginTop:8,maxWidth:"100%",maxHeight:220,borderRadius:8,border:"1px solid #1e2230",objectFit:"contain",display:"block"}}/>}

          {/* 풀이 기록 수정 */}
          {onUpdateCounts && (
            <div style={{marginTop:10,paddingTop:8,borderTop:"1px solid #1a1d27"}}>
              {!editingCounts ? (
                <button onClick={()=>{setFailInput(e.failCount||0);setSolvedInput(!!e.solved);setEditingCounts(true);}} style={{
                  background:"none",border:"1px solid #2a2d3a",borderRadius:7,color:"#6b7280",cursor:"pointer",
                  fontSize:"0.7rem",fontFamily:"'Noto Sans KR',sans-serif",padding:"0.25rem 0.6rem"
                }}>풀이 기록 수정 (틀림 {e.failCount||0}회{e.solved?" · 맞음":""})</button>
              ) : (
                <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}>
                  <label style={{display:"flex",alignItems:"center",gap:5,fontSize:"0.75rem",color:"#9ca3af",fontFamily:"'Noto Sans KR',sans-serif"}}>
                    틀린 횟수
                    <input type="number" min={0} value={failInput} onChange={ev=>setFailInput(ev.target.value)}
                      style={{width:52,background:"#111318",border:"1px solid #2a2d3a",borderRadius:6,color:"#e8eaf0",padding:"0.2rem 0.4rem",fontSize:"0.78rem"}}/>
                  </label>
                  <label style={{display:"flex",alignItems:"center",gap:5,fontSize:"0.75rem",color:"#9ca3af",fontFamily:"'Noto Sans KR',sans-serif",cursor:"pointer"}}>
                    <input type="checkbox" checked={solvedInput} onChange={ev=>setSolvedInput(ev.target.checked)}/>
                    맞음 표시
                  </label>
                  <button onClick={saveCounts} style={{background:"#22c55e18",border:"1px solid #22c55e40",borderRadius:6,color:"#22c55e",cursor:"pointer",fontSize:"0.72rem",fontFamily:"'Noto Sans KR',sans-serif",padding:"0.2rem 0.6rem",fontWeight:700}}>저장</button>
                  <button onClick={()=>setEditingCounts(false)} style={{background:"none",border:"none",color:"#4b5563",cursor:"pointer",fontSize:"0.72rem",fontFamily:"'Noto Sans KR',sans-serif"}}>취소</button>
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
          fontFamily:"'Noto Sans KR',sans-serif",fontSize:"0.72rem",fontWeight:700
        }}>지우개 (필기만 지움)</button>
        <div style={{display:"flex",gap:3,alignItems:"center"}}>
          {[2,4,7].map(w=>(
            <button key={w} onClick={()=>{setLineWidth(w);setTool("pen");}} style={{
              width:26,height:26,borderRadius:6,cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",
              border:lineWidth===w?"1px solid #6366f1":"1px solid #2a2d3a",background:lineWidth===w?"#6366f120":"#111318"
            }}><div style={{width:w+2,height:w+2,borderRadius:"50%",background:"#9ca3af"}}/></button>
          ))}
        </div>
        <button onClick={clearDrawing} style={{marginLeft:"auto",padding:"0.3rem 0.7rem",borderRadius:7,border:"1px solid #2a2d3a",background:"#111318",color:"#6b7280",fontFamily:"'Noto Sans KR',sans-serif",fontSize:"0.72rem",cursor:"pointer"}}>필기 전체 지우기</button>
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
          <span style={{color:c?.text||"#a5b4fc",fontWeight:800,fontSize:"0.9rem",fontFamily:"'Noto Sans KR',sans-serif"}}>{current.subject}</span>
          <Tag code={current.code}/>
          {current.failCount>0&&<span style={{color:"#ef4444",fontSize:"0.72rem",fontFamily:"'JetBrains Mono',monospace",fontWeight:700}}>❌×{current.failCount} 누적</span>}
        </div>
        <div style={{display:"flex",gap:10,alignItems:"center"}}>
          <span style={{color:"#22c55e",fontSize:"0.78rem",fontFamily:"'JetBrains Mono',monospace"}}>✅{results.correct}</span>
          <span style={{color:"#ef4444",fontSize:"0.78rem",fontFamily:"'JetBrains Mono',monospace"}}>❌{results.wrong}</span>
          <span style={{color:"#4b5563",fontSize:"0.75rem",fontFamily:"'Noto Sans KR',sans-serif"}}>{idx+1}/{queue.length}</span>
        </div>
      </div>

      <div style={{maxWidth:720,margin:"0 auto",padding:"1.2rem"}}>
        {current.problem&&<div style={{color:"#9ca3af",fontSize:"0.85rem",fontFamily:"'Noto Sans KR',sans-serif",marginBottom:10}}>{current.problem}</div>}

        {/* 문제 사진 + 필기 캔버스 */}
        <div style={{marginBottom:"1rem"}}>
          <div style={{color:"#4b5563",fontSize:"0.7rem",textTransform:"uppercase",letterSpacing:"0.06em",fontFamily:"'Noto Sans KR',sans-serif",marginBottom:6}}>문제 (여기에 직접 풀어봐)</div>
          <DrawingCanvas key={canvasKey} bgImage={current.photo} height={420}/>
        </div>

        {/* 답 보기 버튼 / 답 표시 */}
        {!showAnswer ? (
          <Btn full color="#f59e0b" onClick={()=>setShowAnswer(true)}>👁️ 답 보기</Btn>
        ) : (
          <div style={{marginBottom:"1rem"}}>
            <div style={{color:"#22c55e",fontSize:"0.7rem",textTransform:"uppercase",letterSpacing:"0.06em",fontFamily:"'Noto Sans KR',sans-serif",marginBottom:6}}>정답</div>
            {current.answerText ? (
              <div style={{background:"#0a0c12",border:"1px solid #22c55e30",borderRadius:10,padding:"1rem",color:"#e8eaf0",fontSize:"1rem",fontWeight:700,fontFamily:"'Noto Sans KR',sans-serif"}}>
                {current.answerText}
              </div>
            ) : (
              <div style={{background:"#0a0c12",border:"1px solid #1e2230",borderRadius:10,padding:"1rem",color:"#4b5563",fontSize:"0.82rem",fontFamily:"'Noto Sans KR',sans-serif"}}>
                등록된 정답이 없어. 오답 수정에서 추가할 수 있어.
              </div>
            )}
            {current.cause&&<div style={{marginTop:8,padding:"0.7rem 0.9rem",background:"#0a0c12",border:"1px solid #1e2230",borderRadius:9,color:"#9ca3af",fontSize:"0.78rem",fontFamily:"'Noto Sans KR',sans-serif",lineHeight:1.6}}>
              <span style={{color:"#6b7280"}}>이전 틀린 이유: </span>{current.cause}
            </div>}
          </div>
        )}

        {/* 채점 버튼 */}
        {showAnswer && (
          <div style={{display:"flex",gap:8,marginTop:"1rem"}}>
            <button onClick={()=>mark("wrong")} style={{
              flex:1,padding:"0.9rem",borderRadius:12,border:"1px solid #ef444450",
              background:"#ef444418",color:"#ef4444",fontFamily:"'Noto Sans KR',sans-serif",
              fontSize:"0.95rem",fontWeight:800,cursor:"pointer"
            }}>❌ 틀렸어</button>
            <button onClick={()=>mark("correct")} style={{
              flex:1,padding:"0.9rem",borderRadius:12,border:"1px solid #22c55e50",
              background:"#22c55e18",color:"#22c55e",fontFamily:"'Noto Sans KR',sans-serif",
              fontSize:"0.95rem",fontWeight:800,cursor:"pointer"
            }}>✅ 맞았어</button>
          </div>
        )}

        {isLast && showAnswer && <div style={{textAlign:"center",color:"#4b5563",fontSize:"0.75rem",marginTop:10,fontFamily:"'Noto Sans KR',sans-serif"}}>마지막 문제야</div>}
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
  lines.push(`총 계획: ${plans.length}개 | 완료: ${planDone}개 | 실패: ${planFailed}개 | 예정: ${planTodo}개`);
  if(plans.length>0) lines.push(`달성률: ${Math.round((planDone/plans.length)*100)}%`);

  // ELS 실험법 현황
  const exps = data.elsExperiments||[];
  const elsReviewsInPeriod = (data.elsReviews||[]).filter(r=>new Date(r.date)>=cutoff);
  lines.push("");
  lines.push(`[ELS 실험법 현황] 등록 ${exps.filter(e=>e.status!=="removed").length}개 · 제거됨 ${exps.filter(e=>e.status==="removed").length}개`);
  if(exps.length===0) lines.push("- 등록된 실험법 없음");
  else {
    for(const subj of ELS_SUBJECTS){
      const subs = ELS_SUBCATEGORIES[subj]||[];
      const subKeys = subs.length>0 ? subs : ["전체"];
      for(const sb of subKeys){
        const subjExps = exps.filter(e=>e.subject===subj && e.sub===sb && e.status!=="removed");
        if(subjExps.length===0) continue;
        lines.push(`${subj}${sb!=="전체"?" · "+sb:""}:`);
        for(const track of ELS_TRACKS){
          const list = subjExps.filter(e=>e.track===track.key).sort((a,b)=>a.order-b.order);
          if(list.length===0) continue;
          lines.push(`  ${track.label}: ` + list.map(e=>`${e.name}${e.score>0?`(★${e.score})`:""}`).join(" > "));
        }
      }
    }
  }
  lines.push("");
  lines.push(`[이 기간 일요일 리뷰] ${elsReviewsInPeriod.length}회`);
  if(elsReviewsInPeriod.length===0) lines.push("- 리뷰 기록 없음");
  else elsReviewsInPeriod.forEach(r=>{
    const goodNames=r.goodIds.map(id=>exps.find(e=>e.id===id)?.name||"?").join(", ");
    const badNames=r.badIds.map(id=>exps.find(e=>e.id===id)?.name||"?").join(", ");
    lines.push(`- [${r.date}] 👍강화: ${goodNames||"없음"} | 👎하향: ${badNames||"없음"}`);
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
            fontFamily:"'Noto Sans KR',sans-serif",fontSize:"0.8rem",fontWeight:700
          }}>{l}</button>
        ))}
      </div>
      <p style={{color:"#6b7280",fontSize:"0.78rem",fontFamily:"'Noto Sans KR',sans-serif",marginBottom:"0.8rem",lineHeight:1.6}}>
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

  function doExport(){
    try{const b=new Blob([jsonText],{type:"application/json"});const a=document.createElement("a");a.href=URL.createObjectURL(b);a.download=`studyos_${todayStr()}.json`;a.click();}catch(e){}
    setShowText(true);
  }
  function doImport(){
    try{const p=JSON.parse(importText);if(!p.wrongs&&!p.timetable){setMsg("형식 오류");return;}onImport({...initialData,...p});setMsg("완료!");}
    catch{setMsg("파싱 오류");}
  }

  return (
    <Modal title="데이터 백업/복원" onClose={onClose}>
      <div style={{display:"flex",gap:3,background:"#111318",borderRadius:8,padding:3,marginBottom:"1.2rem",border:"1px solid #1e2230"}}>
        {[["export","내보내기"],["import","가져오기"]].map(([v,l])=>(
          <button key={v} onClick={()=>setTab(v)} style={{flex:1,padding:"0.42rem",borderRadius:5,border:"none",cursor:"pointer",
            background:tab===v?"#6366f1":"transparent",color:tab===v?"white":"#4b5563",
            fontFamily:"'Noto Sans KR',sans-serif",fontSize:"0.8rem",fontWeight:700}}>{l}</button>
        ))}
      </div>
      {tab==="export"&&<div>
        <div style={{display:"flex",gap:16,flexWrap:"wrap",marginBottom:"1rem"}}>
          {[["타임블록",Object.keys(data.timetable||{}).length+"일"],["오답",data.wrongs.length+"개"]].map(([l,v])=>(
            <div key={l} style={{textAlign:"center"}}>
              <div style={{color:"#6366f1",fontSize:"1.3rem",fontWeight:800,fontFamily:"'JetBrains Mono',monospace"}}>{v}</div>
              <div style={{color:"#4b5563",fontSize:"0.7rem",fontFamily:"'Noto Sans KR',sans-serif"}}>{l}</div>
            </div>
          ))}
        </div>
        <p style={{color:"#f59e0b",fontSize:"0.76rem",fontFamily:"'Noto Sans KR',sans-serif",marginBottom:"1rem"}}>캐시 지우기 전에 반드시 백업해줘.</p>
        <Btn full onClick={doExport}>JSON 내보내기</Btn>
        {showText&&<div style={{marginTop:"1rem"}}>
          <div style={{color:"#22c55e",fontSize:"0.75rem",fontFamily:"'Noto Sans KR',sans-serif",marginBottom:6}}>전체 선택 후 복사 → 구글 드라이브에 저장</div>
          <textarea readOnly value={jsonText} rows={5} style={{...inp,fontSize:"0.68rem",color:"#4b5563",resize:"vertical"}} onFocus={e=>e.target.select()}/>
        </div>}
      </div>}
      {tab==="import"&&<div>
        <textarea value={importText} onChange={e=>setImportText(e.target.value)} rows={6}
          style={{...inp,resize:"vertical",marginBottom:"1rem"}} placeholder="내보낸 JSON 붙여넣기"/>
        {msg&&<div style={{color:msg==="완료!"?"#22c55e":"#ef4444",fontSize:"0.8rem",marginBottom:"0.8rem",fontFamily:"'Noto Sans KR',sans-serif"}}>{msg}</div>}
        <Btn full color="#f59e0b" onClick={doImport}>가져오기 (덮어쓰기)</Btn>
      </div>}
    </Modal>
  );
}


// ── 주간/월간 목표 배너 ──────────────────────────────────────────────────────────
// ── 주간/월간 목표 배너 (미래 주/달로 이동하며 목표 설정 가능) ────────────────────
function addWeeks(dateStr, n) {
  const d = new Date(dateStr); d.setDate(d.getDate() + n*7);
  return d.toISOString().slice(0,10);
}
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
function monthRangeLabel(dateStr) {
  const d = new Date(dateStr);
  return `${d.getFullYear()}년 ${d.getMonth()+1}월`;
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
          <div style={{color:"#f1f3f9",fontSize:"1.05rem",fontWeight:900,fontFamily:"'Noto Sans KR',sans-serif"}}>{year}년 {MONTH_KO[month]}</div>
          {!isCurrentMonth && <div onClick={()=>setMonthOffset(0)} style={{color:"#6366f1",fontSize:"0.68rem",fontFamily:"'Noto Sans KR',sans-serif",cursor:"pointer",textDecoration:"underline",marginTop:2}}>이번 달로</div>}
        </div>
        <button onClick={()=>setMonthOffset(o=>o+1)} style={{background:"#0a0c12",border:"1px solid #1e2230",borderRadius:8,color:"#9ca3af",cursor:"pointer",fontSize:"1.1rem",padding:"0.3rem 0.8rem"}}>›</button>
      </div>

      {/* 이 달의 월간 목표 */}
      <div style={{background:"#f59e0b10",border:"1px solid #f59e0b35",borderRadius:14,padding:"1.1rem",marginBottom:"1.3rem"}}>
        <MonthGoalBlock monthKey={monthKey} goals={monthGoals} onSave={saveGoal} onStatus={setGoalStatus} onDelete={deleteGoal}/>
      </div>

      {/* 이 달에 걸친 주차별 목표 카드들 */}
      <div style={{color:"#6b7280",fontSize:"0.72rem",fontFamily:"'Noto Sans KR',sans-serif",marginBottom:8,paddingLeft:2}}>
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
        <span style={{color:"#f59e0b",fontSize:"0.85rem",fontWeight:900,fontFamily:"'Noto Sans KR',sans-serif"}}>🏁 이 달의 목표</span>
        {goals.length>0&&<span style={{color:"#d97706",fontSize:"0.72rem",fontFamily:"'JetBrains Mono',monospace",fontWeight:700}}>{done}/{goals.length}</span>}
        <div style={{flex:1}}/>
        <button onClick={()=>{setEditGoal(null);setModalOpen(true);}} style={{background:"#f59e0b20",border:"1px solid #f59e0b40",borderRadius:7,color:"#fbbf24",cursor:"pointer",fontSize:"0.74rem",fontFamily:"'Noto Sans KR',sans-serif",fontWeight:700,padding:"0.25rem 0.65rem"}}>+ 목표 추가</button>
      </div>
      {goals.length===0
        ? <div style={{color:"#78716c",fontSize:"0.78rem",fontFamily:"'Noto Sans KR',sans-serif"}}>이 달의 목표가 아직 없어. 위 버튼으로 세워봐.</div>
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
        <span style={{color:"#9ca3af",fontSize:"0.74rem",fontFamily:"'Noto Sans KR',sans-serif"}}>{label}</span>
        {isCurrentWeek&&<span style={{background:"#6366f120",color:"#818cf8",fontSize:"0.62rem",padding:"0.08rem 0.4rem",borderRadius:99,fontFamily:"'Noto Sans KR',sans-serif",fontWeight:700}}>이번 주</span>}
        {goals.length>0&&<span style={{color:"#4b5563",fontSize:"0.68rem",fontFamily:"'JetBrains Mono',monospace"}}>({done}/{goals.length})</span>}
        <div style={{flex:1}}/>
        <button onClick={e=>{e.stopPropagation();setEditGoal(null);setModalOpen(true);setOpen(true);}} style={{background:"none",border:"none",color:"#6366f1",cursor:"pointer",fontSize:"0.7rem",fontFamily:"'Noto Sans KR',sans-serif",fontWeight:700}}>+ 추가</button>
        <span style={{color:"#4b5563",fontSize:"0.68rem"}}>{open?"▲":"▼"}</span>
      </div>
      {open&&(
        <div style={{padding:"0 0.9rem 0.85rem",borderTop:"1px solid #14161f"}}>
          {goals.length===0
            ? <div style={{color:"#4b5563",fontSize:"0.75rem",fontFamily:"'Noto Sans KR',sans-serif",paddingTop:8}}>목표 없음</div>
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

// ── ELS (Evolution Learning System) — 과목x계열 실험법 라이브러리 ─────────────
// 실험법 등록/수정 폼
function ExperimentForm({onSave, onClose, editData, subject, sub, track}) {
  const [name,setName]=useState(editData?.name||"");
  const [note,setNote]=useState(editData?.note||"");
  return (
    <Modal title={editData?"실험법 수정":"새 실험법 추가"} onClose={onClose}>
      <div style={{marginBottom:"0.9rem"}}>
        <div style={{color:"#4b5563",fontSize:"0.68rem",marginBottom:4,fontFamily:"'Noto Sans KR',sans-serif",textTransform:"uppercase",letterSpacing:"0.06em"}}>실험법 이름</div>
        <input value={name} onChange={e=>setName(e.target.value)} style={inp} placeholder="예: 백지회독, 조건 표시, 패러프레이징"/>
      </div>
      <div style={{marginBottom:"1.2rem"}}>
        <div style={{color:"#4b5563",fontSize:"0.68rem",marginBottom:4,fontFamily:"'Noto Sans KR',sans-serif",textTransform:"uppercase",letterSpacing:"0.06em"}}>메모 (선택)</div>
        <textarea value={note} onChange={e=>setNote(e.target.value)} rows={3} style={{...inp,resize:"vertical"}} placeholder="구체적으로 어떻게 실행하는지"/>
      </div>
      <Btn full onClick={()=>{
        if(!name.trim())return;
        onSave({
          id:editData?.id||Date.now(), subject, sub, track, name, note,
          score:editData?.score||0, // 0=미평가, 1~5=별점
          order:editData?.order??9999,
          status:editData?.status||"active", // active | removed
        });
        onClose();
      }}>저장</Btn>
    </Modal>
  );
}

function StarRating({value, onChange}) {
  return (
    <div style={{display:"flex",gap:2}}>
      {[1,2,3,4,5].map(n=>(
        <button key={n} onClick={()=>onChange(value===n?0:n)} style={{
          background:"none",border:"none",cursor:"pointer",padding:0,
          fontSize:"0.95rem",color:n<=value?"#fbbf24":"#2d3241",lineHeight:1
        }}>★</button>
      ))}
    </div>
  );
}

// 실험법 한 줄 카드 — 순서는 수동으로만 이동 (점수와 무관, 학생이 설계한 우선순위 유지)
function ExperimentRow({exp, onScore, onEdit, onDelete, onMove, isFirst, isLast}) {
  const dimmed = exp.score>0 && exp.score<=2;
  return (
    <div style={{
      display:"flex",alignItems:"center",gap:8,padding:"0.55rem 0.7rem",borderRadius:9,
      background:exp.status==="removed"?"#0a0c1280":"#0a0c12",
      border:`1px solid ${exp.status==="removed"?"#ef444425":dimmed?"#4b556330":"#1e2230"}`,
      opacity:exp.status==="removed"?0.45:1
    }}>
      <div style={{display:"flex",flexDirection:"column",gap:1}}>
        <button onClick={()=>onMove(-1)} disabled={isFirst} style={{background:"none",border:"none",color:isFirst?"#2d3241":"#6b7280",cursor:isFirst?"default":"pointer",fontSize:"0.65rem",lineHeight:1,padding:0}}>▲</button>
        <button onClick={()=>onMove(1)} disabled={isLast} style={{background:"none",border:"none",color:isLast?"#2d3241":"#6b7280",cursor:isLast?"default":"pointer",fontSize:"0.65rem",lineHeight:1,padding:0}}>▼</button>
      </div>
      <span style={{color:exp.status==="removed"?"#6b7280":dimmed?"#9ca3af":"#e8eaf0",fontSize:"0.82rem",fontFamily:"'Noto Sans KR',sans-serif",flex:1,textDecoration:exp.status==="removed"?"line-through":"none"}}>
        {exp.name}
      </span>
      {exp.status==="removed"&&<span style={{color:"#ef4444",fontSize:"0.62rem",fontFamily:"'Noto Sans KR',sans-serif",fontWeight:700}}>제거됨</span>}
      <StarRating value={exp.score} onChange={s=>onScore(exp.id,s)}/>
      <button onClick={()=>onEdit(exp)} style={{background:"none",border:"none",color:"#6366f1",cursor:"pointer",fontSize:"0.68rem",fontFamily:"'Noto Sans KR',sans-serif"}}>수정</button>
      <button onClick={()=>onDelete(exp.id)} style={{background:"none",border:"none",color:"#2d3241",cursor:"pointer",fontSize:"0.78rem"}}>×</button>
    </div>
  );
}

// 계열 하나 (예: 국어-모의고사-문학-구조) — 실험법 목록 + 추가
function TrackBlock({subject, sub, track, experiments, onSave, onScore, onDelete, onMove}) {
  const [open,setOpen]=useState(true);
  const [modalOpen,setModalOpen]=useState(false);
  const [editExp,setEditExp]=useState(null);
  const list = experiments.filter(e=>e.subject===subject && e.sub===sub && e.track===track.key).sort((a,b)=>a.order-b.order);
  const activeCount = list.filter(e=>e.status!=="removed").length;
  const avgScore = list.filter(e=>e.score>0).length>0
    ? (list.filter(e=>e.score>0).reduce((a,e)=>a+e.score,0)/list.filter(e=>e.score>0).length).toFixed(1)
    : null;

  return (
    <div style={{background:"#0a0c12",border:`1px solid ${track.color}25`,borderRadius:11,overflow:"hidden",marginBottom:8}}>
      <div onClick={()=>setOpen(o=>!o)} style={{padding:"0.65rem 0.85rem",cursor:"pointer",display:"flex",alignItems:"center",gap:8,background:`${track.color}0c`}}>
        <span style={{color:track.color,fontWeight:800,fontSize:"0.8rem",fontFamily:"'Noto Sans KR',sans-serif"}}>{track.label}</span>
        <span style={{color:"#4b5563",fontSize:"0.66rem",fontFamily:"'JetBrains Mono',monospace"}}>{activeCount}개</span>
        {avgScore&&<span style={{color:"#fbbf24",fontSize:"0.66rem",fontFamily:"'JetBrains Mono',monospace"}}>★{avgScore}</span>}
        <div style={{flex:1}}/>
        <button onClick={e=>{e.stopPropagation();setEditExp(null);setModalOpen(true);setOpen(true);}} style={{background:"none",border:"none",color:track.color,cursor:"pointer",fontSize:"0.7rem",fontFamily:"'Noto Sans KR',sans-serif",fontWeight:700}}>+ 실험법</button>
        <span style={{color:"#4b5563",fontSize:"0.66rem"}}>{open?"▲":"▼"}</span>
      </div>
      {open&&(
        <div style={{padding:"0.6rem 0.7rem"}}>
          <div style={{color:"#6b7280",fontSize:"0.68rem",fontFamily:"'Noto Sans KR',sans-serif",marginBottom:7}}>{track.desc}</div>
          {list.length===0
            ? <div style={{color:"#4b5563",fontSize:"0.76rem",fontFamily:"'Noto Sans KR',sans-serif"}}>등록된 실험법 없음</div>
            : <div style={{display:"flex",flexDirection:"column",gap:5}}>
                {list.map((exp,i)=>(
                  <ExperimentRow key={exp.id} exp={exp}
                    onScore={onScore} onEdit={e=>{setEditExp(e);setModalOpen(true);}} onDelete={onDelete}
                    onMove={dir=>onMove(exp.id,dir)}
                    isFirst={i===0} isLast={i===list.length-1}/>
                ))}
              </div>
          }
        </div>
      )}
      {modalOpen&&(
        <ExperimentForm editData={editExp} subject={subject} sub={sub} track={track.key}
          onSave={e=>{onSave(e);setModalOpen(false);setEditExp(null);}}
          onClose={()=>{setModalOpen(false);setEditExp(null);}}/>
      )}
    </div>
  );
}

// 일요일 밤 리뷰 — 전체 과목x세분화x계열 실험법 중 BEST 3 / WORST 3 선택
function ELSWeeklyReview({experiments, onSave, onClose}) {
  const [goodIds,setGoodIds]=useState([]);
  const [badIds,setBadIds]=useState([]);
  const active = experiments.filter(e=>e.status!=="removed");

  function toggleGood(id){
    setBadIds(b=>b.filter(x=>x!==id));
    setGoodIds(g=>g.includes(id)?g.filter(x=>x!==id):(g.length<3?[...g,id]:g));
  }
  function toggleBad(id){
    setGoodIds(g=>g.filter(x=>x!==id));
    setBadIds(b=>b.includes(id)?b.filter(x=>x!==id):(b.length<3?[...b,id]:b));
  }

  // 과목 > 세부 로 그룹핑해서 보여줌
  const grouped = {};
  for(const e of active){
    const gkey = `${e.subject
