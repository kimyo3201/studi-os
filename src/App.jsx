import { useState, useEffect, useRef, useCallback } from "react";

// ── 상수 ──────────────────────────────────────────────────────────────────────
const SUBJECTS = ["수학","영어","국어","과학","사회","한국사","물리","화학","생물","지구과학"];
const SUBJECT_COLORS = {
  수학:   { bg:"#6366f1", light:"#6366f130", text:"#a5b4fc" },
  영어:   { bg:"#10b981", light:"#10b98130", text:"#6ee7b7" },
  국어:   { bg:"#f59e0b", light:"#f59e0b30", text:"#fcd34d" },
  과학:   { bg:"#3b82f6", light:"#3b82f630", text:"#93c5fd" },
  사회:   { bg:"#ec4899", light:"#ec489930", text:"#f9a8d4" },
  한국사: { bg:"#8b5cf6", light:"#8b5cf630", text:"#c4b5fd" },
  물리:   { bg:"#06b6d4", light:"#06b6d430", text:"#67e8f9" },
  화학:   { bg:"#f97316", light:"#f9731630", text:"#fdba74" },
  생물:   { bg:"#22c55e", light:"#22c55e30", text:"#86efac" },
  지구과학:{ bg:"#84cc16", light:"#84cc1630", text:"#bef264" },
};
const ERROR_CODES = {
  "XM-R":{ desc:"독해 오류", color:"#f97316" },
  "XM-C":{ desc:"개념 오류", color:"#ef4444" },
  "XS":  { desc:"선지/조건 판단", color:"#a78bfa" },
  "XD":  { desc:"주의 실수", color:"#06b6d4" },
  "XR":  { desc:"처리 오류", color:"#3b82f6" },
  "XT-T":{ desc:"시간 배분", color:"#f59e0b" },
  "XT-M":{ desc:"전략/메타인지", color:"#10b981" },
  "XF":  { desc:"감 풀이", color:"#ec4899" },
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
};

function load() {
  try { const r=localStorage.getItem(STORAGE_KEY); return r?JSON.parse(r):initialData; }
  catch { return initialData; }
}
function save(d) { try { localStorage.setItem(STORAGE_KEY,JSON.stringify(d)); } catch {} }

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

async function callAI(prompt) {
  const res=await fetch("/api/claude",{
    method:"POST",headers:{"Content-Type":"application/json"},
    body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1000,messages:[{role:"user",content:prompt}]})
  });
  const json=await res.json();
  return json.content?.map(c=>c.text||"").join("")||"오류";
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
              padding:"0.3rem 0.75rem",borderRadius:8,border:`2px solid ${paintSubject===sub&&!erasing?c.bg:"transparent"}`,
              background:c.light,color:c.text,fontFamily:"'Noto Sans KR',sans-serif",
              fontSize:"0.75rem",fontWeight:700,cursor:"pointer",
              boxShadow:paintSubject===sub&&!erasing?`0 0 12px ${c.bg}60`:undefined
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
                      background:sub?c.bg+"e0":"transparent",
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
        onSave({id:editData?.id||Date.now(),date,subject,content,difficulty,focusTarget,note,status:"todo"});
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
      <div style={{color:plan.status==="done"?"#4b5563":"#d1d5db",fontSize:"0.82rem",fontFamily:"'Noto Sans KR',sans-serif",lineHeight:1.6,marginBottom:plan.note?6:8,textDecoration:plan.status==="done"?"line-through":"none"}}>{plan.content}</div>
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
function WrongForm({onSave,onClose,editData}) {
  const [date,setDate]=useState(editData?.date||todayStr());
  const [subject,setSubject]=useState(editData?.subject||"수학");
  const [code,setCode]=useState(editData?.code||"XM-C");
  const [problem,setProblem]=useState(editData?.problem||"");
  const [cause,setCause]=useState(editData?.cause||"");
  const [fix,setFix]=useState(editData?.fix||"");
  const [photo,setPhoto]=useState(editData?.photo||null);

  function handlePhoto(e) {
    const file=e.target.files[0]; if(!file)return;
    if(file.size>4*1024*1024){alert("4MB 이하 사진만 가능해");return;}
    const reader=new FileReader();
    reader.onload=ev=>setPhoto(ev.target.result);
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

      {/* 오답 코드 — 버튼 선택 */}
      <div style={{marginBottom:"0.9rem"}}>
        <div style={{color:"#4b5563",fontSize:"0.68rem",marginBottom:6,fontFamily:"'Noto Sans KR',sans-serif",textTransform:"uppercase",letterSpacing:"0.06em"}}>오답 코드</div>
        <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
          {Object.entries(ERROR_CODES).map(([k,v])=>(
            <button key={k} onClick={()=>setCode(k)} style={{
              padding:"0.3rem 0.65rem",borderRadius:8,cursor:"pointer",
              border:`1px solid ${code===k?v.color:v.color+"40"}`,
              background:code===k?v.color+"25":"transparent",
              color:code===k?v.color:v.color+"99",
              fontFamily:"'JetBrains Mono',monospace",fontSize:"0.72rem",fontWeight:700
            }}>{k}</button>
          ))}
        </div>
        <div style={{color:ERROR_CODES[code].color,fontSize:"0.72rem",marginTop:5,fontFamily:"'Noto Sans KR',sans-serif"}}>
          {ERROR_CODES[code].desc}
        </div>
      </div>

      <div style={{marginBottom:"0.9rem"}}>
        <div style={{color:"#4b5563",fontSize:"0.68rem",marginBottom:4,fontFamily:"'Noto Sans KR',sans-serif",textTransform:"uppercase",letterSpacing:"0.06em"}}>문제 번호/요약 (선택)</div>
        <input value={problem} onChange={e=>setProblem(e.target.value)} style={inp} placeholder="예: 3번, 함수 합성"/>
      </div>

      {/* 사진 */}
      <div style={{marginBottom:"0.9rem"}}>
        <div style={{color:"#4b5563",fontSize:"0.68rem",marginBottom:4,fontFamily:"'Noto Sans KR',sans-serif",textTransform:"uppercase",letterSpacing:"0.06em"}}>문제 사진 (선택)</div>
        <input type="file" accept="image/*" capture="environment" onChange={handlePhoto}
          style={{...inp,padding:"0.4rem 0.6rem",fontSize:"0.78rem",cursor:"pointer"}}/>
        {photo&&<div style={{marginTop:6,display:"flex",alignItems:"center",gap:8}}>
          <img src={photo} alt="미리보기" style={{height:60,borderRadius:6,border:"1px solid #1e2230",objectFit:"contain"}}/>
          <button onClick={()=>setPhoto(null)} style={{background:"none",border:"none",color:"#ef4444",cursor:"pointer",fontSize:"0.75rem",fontFamily:"'Noto Sans KR',sans-serif"}}>삭제</button>
        </div>}
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
        if(!cause.trim()&&!problem.trim())return;
        onSave({id:editData?.id||Date.now(),date,subject,code,problem,cause,fix,photo});
        onClose();
      }}>저장</Btn>
    </Modal>
  );
}

// ── 오답 폴더 ──────────────────────────────────────────────────────────────────
function WrongFolder({wrongs,onDelete,onEdit,folderNames,onRenameFolder}) {
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
                <div style={{background:"#0a0c12",border:`1px solid ${c.bg}30`,borderRadius:12,overflow:"hidden"}}>
                  <div onClick={()=>setOpenSubs(s=>({...s,[sub]:!s[sub]}))} style={{padding:"0.85rem 1.1rem",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div style={{display:"flex",alignItems:"center",gap:10}}>
                      <span>{subOpen?"📂":"📁"}</span>
                      {editingFolder===sub
                        ?<input autoFocus value={editingName} onChange={e=>setEditingName(e.target.value)}
                            onBlur={commitRename} onKeyDown={e=>{if(e.key==="Enter")commitRename();e.stopPropagation();}}
                            onClick={e=>e.stopPropagation()} style={{...inp,width:140,padding:"0.22rem 0.5rem",fontSize:"0.82rem"}}/>
                        :<span style={{color:"#f1f3f9",fontWeight:800,fontSize:"0.9rem",fontFamily:"'Noto Sans KR',sans-serif"}}>{getName(sub)}</span>
                      }
                      <span style={{background:`${c.bg}20`,color:c.text,fontSize:"0.7rem",padding:"0.1rem 0.45rem",borderRadius:99,fontFamily:"'JetBrains Mono',monospace",fontWeight:700}}>{subEntries.length}</span>
                    </div>
                    <div style={{display:"flex",gap:8,alignItems:"center"}}>
                      <button onClick={e=>startRename(e,sub,getName(sub))} style={{background:"none",border:"none",color:"#4b5563",cursor:"pointer",fontSize:"0.68rem",fontFamily:"'Noto Sans KR',sans-serif"}}>수정</button>
                      <span style={{color:"#2d3241",fontSize:"0.75rem"}}>{subOpen?"▲":"▼"}</span>
                    </div>
                  </div>
                  {subOpen&&(
                    <div style={{padding:"0 0.8rem 0.8rem",borderTop:`1px solid ${c.bg}20`}}>
                      {Object.entries(byCode).sort((a,b)=>b[1].length-a[1].length).map(([code,codeEntries])=>{
                        const codeKey=sub+"/"+code;
                        const codeOpen=openCodes[codeKey];
                        const cc=ERROR_CODES[code];
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
                                <button onClick={e=>startRename(e,codeKey,getName(codeKey))} style={{background:"none",border:"none",color:"#4b5563",cursor:"pointer",fontSize:"0.65rem",fontFamily:"'Noto Sans KR',sans-serif"}}>수정</button>
                                <span style={{color:"#2d3241",fontSize:"0.7rem"}}>{codeOpen?"▲":"▼"}</span>
                              </div>
                            </div>
                            {codeOpen&&(
                              <div style={{padding:"0 0.65rem 0.65rem",borderTop:`1px solid ${cc.color}15`}}>
                                {[...codeEntries].reverse().map(e=><WrongCard key={e.id} e={e} onDelete={onDelete} onEdit={onEdit}/>)}
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
          {[...filtered].reverse().map(e=><WrongCard key={e.id} e={e} onDelete={onDelete} onEdit={onEdit}/>)}
        </div>
      )}
    </div>
  );
}

function WrongCard({e,onDelete,onEdit}) {
  const [open,setOpen]=useState(false);
  const c=SUBJECT_COLORS[e.subject];
  return (
    <div style={{background:"#0d0f18",border:"1px solid #1e2230",borderRadius:9,marginBottom:5,overflow:"hidden"}}>
      <div onClick={()=>setOpen(o=>!o)} style={{padding:"0.65rem 0.9rem",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{display:"flex",alignItems:"center",gap:7,flexWrap:"wrap"}}>
          <span style={{color:c?.text||"#a5b4fc",fontSize:"0.75rem",fontWeight:800,fontFamily:"'Noto Sans KR',sans-serif"}}>{e.subject}</span>
          <Tag code={e.code}/>
          {e.photo&&<span style={{fontSize:"0.7rem"}}>📷</span>}
          <span style={{color:"#6b7280",fontSize:"0.75rem",fontFamily:"'Noto Sans KR',sans-serif"}}>{e.problem||e.cause.slice(0,25)+(e.cause.length>25?"...":"")}</span>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
          <span style={{color:"#2d3241",fontSize:"0.65rem",fontFamily:"'JetBrains Mono',monospace"}}>{e.date}</span>
          <button onClick={ev=>{ev.stopPropagation();onEdit(e);}} style={{background:"none",border:"none",color:"#6366f1",cursor:"pointer",fontSize:"0.7rem",fontFamily:"'Noto Sans KR',sans-serif"}}>수정</button>
          <button onClick={ev=>{ev.stopPropagation();onDelete(e.id);}} style={{background:"none",border:"none",color:"#2d3241",cursor:"pointer",fontSize:"0.82rem"}}>×</button>
          <span style={{color:"#2d3241",fontSize:"0.7rem"}}>{open?"▲":"▼"}</span>
        </div>
      </div>
      {open&&(
        <div style={{padding:"0 0.9rem 0.85rem",borderTop:"1px solid #1a1d27"}}>
          {e.cause&&<div style={{color:"#9ca3af",fontSize:"0.8rem",fontFamily:"'Noto Sans KR',sans-serif",lineHeight:1.75,marginTop:8}}>{e.cause}</div>}
          {e.fix&&<div style={{color:"#10b981",fontSize:"0.76rem",fontFamily:"'Noto Sans KR',sans-serif",marginTop:5}}>→ {e.fix}</div>}
          {e.photo&&<img src={e.photo} alt="오답" style={{marginTop:8,maxWidth:"100%",maxHeight:220,borderRadius:8,border:"1px solid #1e2230",objectFit:"contain",display:"block"}}/>}
        </div>
      )}
    </div>
  );
}

// ── AI 분석 ────────────────────────────────────────────────────────────────────
function AIAnalysis({data,period,wrongsOnly,onClose}) {
  const [loading,setLoading]=useState(true);
  const [initText,setInitText]=useState("");
  const [messages,setMessages]=useState([]);
  const [input,setInput]=useState("");
  const [chatLoading,setChatLoading]=useState(false);

  const pLabel=period==="week"?"주간":period==="month"?"월간":"3개월";

  function buildContext() {
    const now=new Date();
    const cutoff=new Date();
    if(period==="week")cutoff.setDate(now.getDate()-7);
    else if(period==="month")cutoff.setMonth(now.getMonth()-1);
    else cutoff.setMonth(now.getMonth()-3);

    // 공부 시간 집계
    const subMinsTotal={};
    let totalMins=0;
    for(const [dateStr,slots] of Object.entries(data.timetable)){
      if(new Date(dateStr)<cutoff)continue;
      const sm=calcSubjectMinutes(slots);
      for(const [s,m] of Object.entries(sm)){subMinsTotal[s]=(subMinsTotal[s]||0)+m;totalMins+=m;}
    }

    // 오답 집계
    const wrongs=data.wrongs.filter(w=>new Date(w.date)>=cutoff);
    const byCode={},bySubject={};
    for(const w of wrongs){byCode[w.code]=(byCode[w.code]||0)+1;bySubject[w.subject]=(bySubject[w.subject]||0)+1;}

    return `== ${pLabel} 학습 데이터 ==
총 공부시간: ${Math.floor(totalMins/60)}h ${totalMins%60}m
과목별: ${Object.entries(subMinsTotal).sort((a,b)=>b[1]-a[1]).map(([s,m])=>`${s} ${Math.floor(m/60)}h${m%60}m`).join(", ")||"없음"}
오답(${wrongs.length}개) 코드별: ${Object.entries(byCode).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`${k}:${v}`).join(", ")||"없음"}
오답 과목별: ${Object.entries(bySubject).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`${k}:${v}`).join(", ")||"없음"}
최근 오답: ${wrongs.slice(-10).map(w=>`[${w.subject}/${w.code}]${w.cause?` ${w.cause}`:""}`).join(" | ")||"없음"}`;
  }

  const SYS="너는 대한민국 전교 최상위권 달성을 목표로 하는 고등학생의 전담 학습 코치야. 데이터 기반으로만 분석하고, 근본 원인까지 파고들고, 즉시 실행 가능한 처방을 줘. 냉정하고 직설적으로. 오답코드: XM-R독해 XM-C개념 XS선지조건 XD주의실수 XR처리오류 XT-T시간배분 XT-M전략메타인지 XF감풀이";

  useEffect(()=>{
    const ctx=buildContext();
    if(!ctx.includes("h "))  {setInitText("데이터가 없어. 먼저 타임테이블을 채워줘.");setLoading(false);return;}
    callAI(SYS+"\n\n"+ctx+"\n\n["+pLabel+" 종합 요약] 핵심 수치와 전반적 평가\n[시간 배분 분석] 과목별 투자 시간 적절성, 불균형 과목\n[황금 시간대] 어떤 과목을 언제 공부하면 좋은지\n[오답 패턴] 지배적 오류, 반복 실수, 즉시 처방\n[병목 진단] 지금 나를 가장 붙잡는 장애물 3가지\n[전교 최상위권 대비] 이 패턴 대비 최상위권과의 차이\n[다음 "+pLabel+" 목표] 측정 가능한 목표 3가지\n\n마지막에: 어떤 부분을 더 파고들까?")
      .then(t=>{setInitText(t);setMessages([{role:"assistant",content:t}]);setLoading(false);})
      .catch(()=>{setInitText("AI 오류");setLoading(false);});
  },[]);

  async function send() {
    if(!input.trim()||chatLoading)return;
    const um={role:"user",content:input.trim()};
    const next=[...messages,um];
    setMessages(next);setInput("");setChatLoading(true);
    try{
      const res=await fetch("/api/claude",{method:"POST",headers:{"Content-Type":"application/json"},
        body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1000,
          messages:[{role:"user",content:SYS+"\n\n"+buildContext()+"\n\n위 데이터 기반으로 답해줘."},{role:"assistant",content:initText},...next.slice(1)]})});
      const json=await res.json();
      setMessages(m=>[...m,{role:"assistant",content:json.content?.map(c=>c.text||"").join("")||"오류"}]);
    }catch{setMessages(m=>[...m,{role:"assistant",content:"오류. 다시 시도해줘."}]);}
    setChatLoading(false);
  }

  return (
    <Modal title={`AI ${pLabel} 분석`} onClose={onClose} wide>
      {loading?<Spinner/>:(
        <div>
          <div style={{maxHeight:400,overflowY:"auto",display:"flex",flexDirection:"column",gap:10,marginBottom:"1rem"}}>
            {messages.map((m,i)=>(
              <div key={i} style={{display:"flex",justifyContent:m.role==="user"?"flex-end":"flex-start"}}>
                <div style={{maxWidth:"88%",padding:"0.85rem 1rem",borderRadius:12,
                  background:m.role==="user"?"#6366f1":"#111318",
                  border:m.role==="user"?"none":"1px solid #1e2230",
                  color:m.role==="user"?"white":"#c9cbd4",
                  fontSize:"0.82rem",lineHeight:1.85,fontFamily:"'Noto Sans KR',sans-serif",whiteSpace:"pre-wrap"}}>{m.content}</div>
              </div>
            ))}
            {chatLoading&&<div style={{display:"flex",gap:5}}>{[0,1,2].map(i=><div key={i} style={{width:6,height:6,borderRadius:"50%",background:"#6366f1",animation:`pulse 1.2s ${i*0.2}s infinite`}}/>)}</div>}
          </div>
          <div style={{display:"flex",gap:5,flexWrap:"wrap",marginBottom:8}}>
            {["수학 집중 분석","오답 패턴 처방","이번 주 약점","시간 배분 개선"].map(q=>(
              <button key={q} onClick={()=>setInput(q)} style={{padding:"0.26rem 0.6rem",borderRadius:99,border:"1px solid #2a2d3a",background:"#111318",color:"#6b7280",fontSize:"0.7rem",fontFamily:"'Noto Sans KR',sans-serif",cursor:"pointer"}}>{q}</button>
            ))}
          </div>
          <div style={{display:"flex",gap:8}}>
            <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&send()}
              style={{...inp,flex:1}} placeholder="더 파고들 부분을 말해줘"/>
            <Btn onClick={send} disabled={chatLoading||!input.trim()}>전송</Btn>
          </div>
        </div>
      )}
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


// ── 스케줄 뷰 (타임테이블 + 계획 동시) ──────────────────────────────────────────
function ScheduleView({data,setData,initDate}) {
  const [date,setDate]=useState(initDate||todayStr());
  const [paintSubject,setPaintSubject]=useState("수학");
  const [erasing,setErasing]=useState(false);
  const [dragging,setDragging]=useState(false);
  const [planModal,setPlanModal]=useState(null);
  const [editPlan,setEditPlan]=useState(null);

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
  function setStatus(id,status){
    setData(d=>{
      const list=[...(d.plans2||[])];
      const idx=list.findIndex(x=>x.id===id);if(idx<0)return d;
      const plan={...list[idx],status};list[idx]=plan;
      if(status==="failed"){
        const tom=nextDay(plan.date);
        if(!list.some(p=>p.id===plan.id+"_m_"+tom))
          list.push({...plan,id:plan.id+"_m_"+tom,date:tom,status:"todo",note:"[이월] "+plan.content.slice(0,30)});
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
            fontFamily:"'Noto Sans KR',sans-serif",fontSize:"0.72rem",fontWeight:700}}>칠하기</button>
          <button onClick={()=>setErasing(true)} style={{padding:"0.28rem 0.65rem",borderRadius:5,border:"none",cursor:"pointer",
            background:erasing?"#ef4444":"transparent",color:erasing?"white":"#4b5563",
            fontFamily:"'Noto Sans KR',sans-serif",fontSize:"0.72rem",fontWeight:700}}>지우기</button>
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
            border:`2px solid ${paintSubject===sub&&!erasing?c.bg:"transparent"}`,
            background:c.light,color:c.text,fontFamily:"'Noto Sans KR',sans-serif",
            fontSize:"0.72rem",fontWeight:700,cursor:"pointer",
            boxShadow:paintSubject===sub&&!erasing?`0 0 10px ${c.bg}55`:undefined
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
                      background:sub?c.bg+"e0":"transparent",borderLeft:"1px solid #1a1d27",
                      position:"relative",transition:"background 0.04s"}}>
                    {sub&&mi===0&&<span style={{position:"absolute",left:1,top:1,fontSize:"0.5rem",color:"white",
                      fontFamily:"'Noto Sans KR',sans-serif",pointerEvents:"none",whiteSpace:"nowrap",overflow:"hidden",maxWidth:32,opacity:0.9}}>{sub}</span>}
                  </div>;
                })}
              </div>
            ))}
          </div>
        </div>

        {/* 계획 패널 */}
        <div>
          <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"0.8rem"}}>
            <span style={{color:"#9ca3af",fontSize:"0.78rem",fontFamily:"'Noto Sans KR',sans-serif",fontWeight:700}}>
              오늘 계획 <span style={{color:"#6366f1"}}>{dayPlans.length}개</span>
              <span style={{color:"#22c55e",marginLeft:6}}>✅{dayPlans.filter(p=>p.status==="done").length}</span>
              <span style={{color:"#ef4444",marginLeft:4}}>❌{dayPlans.filter(p=>p.status==="failed").length}</span>
            </span>
            <Btn small color="#6366f1" onClick={()=>{setEditPlan(null);setPlanModal("add");}}>+ 추가</Btn>
          </div>
          {dayPlans.length===0
            ?<div style={{color:"#2d3241",fontSize:"0.8rem",textAlign:"center",padding:"2rem 0",fontFamily:"'Noto Sans KR',sans-serif"}}>계획 없음</div>
            :dayPlans.map(p=><PlanCard key={p.id} plan={p} onStatus={setStatus}
                onEdit={p=>{setEditPlan(p);setPlanModal("edit");}} onDelete={deletePlan}/>)
          }
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
  const today=todayStr();
  const MONTH_KO=["1월","2월","3월","4월","5월","6월","7월","8월","9월","10월","11월","12월"];
  const firstDay=new Date(year,month,1).getDay();
  const daysInMonth=new Date(year,month+1,0).getDate();
  const cells=[];
  for(let i=0;i<(firstDay===0?6:firstDay-1);i++)cells.push(null);
  for(let d=1;d<=daysInMonth;d++)cells.push(d);
  function ds(d){return `${year}-${String(month+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;}
  function prev(){if(month===0){setMonth(11);setYear(y=>y-1);}else setMonth(m=>m-1);}
  function next(){if(month===11){setMonth(0);setYear(y=>y+1);}else setMonth(m=>m+1);}

  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"1.1rem"}}>
        <button onClick={prev} style={{background:"none",border:"none",color:"#6b7280",cursor:"pointer",fontSize:"1.2rem",padding:"0.3rem 0.6rem"}}>‹</button>
        <span style={{color:"#f1f3f9",fontWeight:800,fontSize:"1rem",fontFamily:"'Noto Sans KR',sans-serif"}}>{year}년 {MONTH_KO[month]}</span>
        <button onClick={next} style={{background:"none",border:"none",color:"#6b7280",cursor:"pointer",fontSize:"1.2rem",padding:"0.3rem 0.6rem"}}>›</button>
      </div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:2,marginBottom:4}}>
        {["월","화","수","목","금","토","일"].map((d,i)=>(
          <div key={d} style={{textAlign:"center",color:i===5?"#8b5cf6":i===6?"#ef4444":"#4b5563",fontSize:"0.68rem",fontFamily:"'Noto Sans KR',sans-serif",fontWeight:700,padding:"0.25rem 0"}}>{d}</div>
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
            <div key={d} onClick={()=>onSelectDate(dateStr)} style={{
              background:isToday?"#1a1d2e":"#0a0c12",
              border:`1px solid ${isToday?"#6366f1":"#1e2230"}`,
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
      {/* 월간 통계 */}
      <div style={{marginTop:"1.2rem",background:"#0a0c12",border:"1px solid #1e2230",borderRadius:12,padding:"1rem"}}>
        <div style={{color:"#4b5563",fontSize:"0.65rem",textTransform:"uppercase",letterSpacing:"0.07em",fontFamily:"'Noto Sans KR',sans-serif",marginBottom:10}}>이번 달 누적</div>
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
                  <span style={{color:c.text,fontSize:"0.75rem",fontWeight:700,fontFamily:"'Noto Sans KR',sans-serif"}}>{sub}</span>
                  <span style={{color:"#4b5563",fontSize:"0.68rem",fontFamily:"'JetBrains Mono',monospace"}}>{Math.floor(m/60)}h {m%60}m</span>
                </div>
                <div style={{height:4,background:"#111318",borderRadius:99,overflow:"hidden"}}>
                  <div style={{height:"100%",width:`${(m/total)*100}%`,background:c.bg,borderRadius:99}}/>
                </div>
              </div>;
            })}
            {rate!==null&&<div style={{marginTop:8,color:"#f59e0b",fontSize:"0.75rem",fontFamily:"'Noto Sans KR',sans-serif",fontWeight:700}}>계획 달성률 {rate}%</div>}
          </>;
        })()}
      </div>
    </div>
  );
}

// ── 레퍼런스 패널 ──────────────────────────────────────────────────────────────
const REF_DATA = {
  수학: {
    color:"#6366f1",
    출제경향:["조건 다중처리 — 조건 2개 이상 동시에 처리해야 풀림","배점정교화 — 부분 배점 까다로움","조건 누락 유도 — 조건 놓치면 함정에 빠짐","3개 틀림 패턴: 두 개는 계산실수(무조건 1글쓰고 1번 검산) + 나머지 문제 대충 읽음"],
    공부법:["처음 20초: 계산 금지. 조건/목표/개념 후보만 파악","정의 번역: 중점→AM=MB, 수직→90°, 이등변→AB=AC","조건 4추적: 왜 줬지? / 어디 쓰이지? / 없으면? / 생산하는 정보는?","막혔을 때: '왜 안 풀리지?' 금지 → 내 정보/조건/관계/개념 체크","정답 후 복기: 왜 먹혔지? 더 빠른 방법? 핵심 조건? 출제 의도?","틀리면 즉시 AI에게 찍어서 논리 추적 → 원인 분류 → 재도전","하루 1문제 연구: 핵심조건/정의번역/출제의도/함정/최적풀이 분석"],
    오답분류:{"XM-C":"조건→정보 연결 실패 (가장 중요, 최상위권 차이)","XR":"계산실수/부호/단위 누락","XD":"조건 누락/숫자 오독","XT-T":"4점 문제 시간 낭비"},
  },
  국어: {
    color:"#f59e0b",
    출제경향:["선지 O/X 체크 안 하면 함정 — 틀린 이유에 집중","새 관점/개념 제시 → 비어있으면 낚힘","복합지문 비교↑, 중층적 vs 차이점 문제 多","논증-주론 지문 핵심 문장 넣는 문제↑","서술형: 조건 기반 빈칸수, 대충 느낌으로는 X","선지 잠정 매우 교묘 — 끝까지 의심"],
    공부법:["구조 30초 설명: 시(화자→정서→변화→주제) / 소설(인물→갈등→사건→결말)","출제자 모드: '내가 선생님이면 어디를 바꿔 틀리게 할까?' 매번","7가지 비틀기: 주체/원인/결과/감정/시간/범위/단정(항상·반드시·완전히·오직)","소재/지시어/시어: '~은 ~을 의미한다' 형태로 문장 저장","개념공부: 이해→적용→산출 공법 (단순 암기 X, 적용이 포인트)","배경개념 → 직접 예문/선지 만들어보기","서술형: 우선적 조건 먼저 쓰기"],
    오답분류:{"XM-R":"지문 독해 실패","XM-C":"개념 공부 부족","XS":"선지 비틀기 미파악","XF":"감으로 선지 선택"},
  },
  한국사: {
    color:"#8b5cf6",
    출제경향:["암기만으로 안 됨 → 5개 틀림 패턴: 글X/안알려진 문제 몰라서/사료 참고X","사료제시 → 판별 → 근거 문제↑","축 쌓기: 정치사+제도사/문화사/경제사","선지 매우 교묘 — 마지막 선지까지 정독","한 사건 속 정밀한 시간 흐름 파악 요구"],
    공부법:["사료 공부법: 사료보기 → 어느 시대? → 어느 사건/제도/인물? → 왜 그렇게 됐나?","평소 암기독 + 단위/시기 끝날 때마다 정리: 제도?문화?경제?","무언가 이상한 선지 = 무조건 의심","답 바꾸지 X","형광펜 계층구조 후 반드시 백지로 구조 재현 테스트","문제 중 더 풀기: 문제정중에 더 풀기, 3원인 풀기"],
    오답분류:{"XM-C":"암기 부족/세부 개념 흐릿","XS":"선지 교묘한 변형 미파악","XF":"확신 없이 감으로 선택","XD":"사료 오독"},
  },
  사회: {
    color:"#ec4899",
    출제경향:["자료 해석에서 내 언어로 다시 이해해야 함","선지 개별 검증, 자략인 듯한 선지도 검증 필요","통계 기반 맞춤 필터링 + 문제 응용↑"],
    공부법:["백지회독 + 계층 구조화 (개념 관계와 인과 중심)","자료 해석: 내 언어로 다시 이해 → 선지 개별 검증","통계/그래프: 수치 직접 계산해서 검증"],
    오답분류:{"XM-R":"자료 해석 실패","XM-C":"개념 적용 오류","XS":"선지 판단 실수"},
  },
};

function ReferencePanel({wrongs}) {
  const [activeSub,setActiveSub]=useState("수학");
  const ref=REF_DATA[activeSub];
  const c=SUBJECT_COLORS[activeSub];
  const subWrongs=wrongs.filter(w=>w.subject===activeSub);
  const byCode={};
  for(const w of subWrongs)byCode[w.code]=(byCode[w.code]||0)+1;
  const sorted=Object.entries(byCode).sort((a,b)=>b[1]-a[1]);

  return (
    <div>
      <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:"1.2rem"}}>
        {Object.keys(REF_DATA).map(sub=>{
          const sc=SUBJECT_COLORS[sub];
          return <button key={sub} onClick={()=>setActiveSub(sub)} style={{
            padding:"0.3rem 0.8rem",borderRadius:8,cursor:"pointer",
            border:`2px solid ${activeSub===sub?sc.bg:"transparent"}`,
            background:sc.light,color:sc.text,
            fontFamily:"'Noto Sans KR',sans-serif",fontSize:"0.76rem",fontWeight:700,
            boxShadow:activeSub===sub?`0 0 10px ${sc.bg}50`:undefined
          }}>{sub}</button>;
        })}
      </div>

      <div style={{display:"flex",flexDirection:"column",gap:10}}>
        {/* 오답 현황 */}
        <div style={{background:"#0a0c12",border:`1px solid ${c.bg}30`,borderRadius:13,padding:"1.1rem"}}>
          <div style={{color:c.text,fontSize:"0.68rem",textTransform:"uppercase",letterSpacing:"0.07em",fontFamily:"'Noto Sans KR',sans-serif",marginBottom:10,fontWeight:700}}>
            ❌ {activeSub} 오답 현황 — 총 {subWrongs.length}개
          </div>
          {sorted.length===0
            ?<div style={{color:"#2d3241",fontSize:"0.8rem",fontFamily:"'Noto Sans KR',sans-serif"}}>아직 오답 없음</div>
            :<div style={{display:"flex",flexDirection:"column",gap:7}}>
              {sorted.map(([code,cnt])=>{
                const ec=ERROR_CODES[code];
                const pct=Math.round((cnt/subWrongs.length)*100);
                return <div key={code}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:3,alignItems:"center"}}>
                    <div style={{display:"flex",alignItems:"center",gap:6}}><Tag code={code}/><span style={{color:"#6b7280",fontSize:"0.73rem",fontFamily:"'Noto Sans KR',sans-serif"}}>{ec?.desc}</span></div>
                    <span style={{color:"#4b5563",fontSize:"0.7rem",fontFamily:"'JetBrains Mono',monospace"}}>{cnt}개 ({pct}%)</span>
                  </div>
                  <div style={{height:4,background:"#111318",borderRadius:99,overflow:"hidden"}}>
                    <div style={{height:"100%",width:`${pct}%`,background:ec?.color||c.bg,borderRadius:99}}/>
                  </div>
                </div>;
              })}
            </div>
          }
        </div>

        {/* 출제 경향 */}
        <div style={{background:"#0a0c12",border:"1px solid #1e2230",borderRadius:13,padding:"1.1rem"}}>
          <div style={{color:"#ef4444",fontSize:"0.68rem",textTransform:"uppercase",letterSpacing:"0.07em",fontFamily:"'Noto Sans KR',sans-serif",marginBottom:10,fontWeight:700}}>🎯 우리 학교 출제 경향</div>
          <div style={{display:"flex",flexDirection:"column",gap:6}}>
            {ref.출제경향.map((t,i)=><div key={i} style={{display:"flex",gap:8,alignItems:"flex-start"}}>
              <span style={{color:"#ef4444",fontSize:"0.68rem",fontFamily:"'JetBrains Mono',monospace",flexShrink:0,marginTop:2,fontWeight:700}}>{String(i+1).padStart(2,"0")}</span>
              <span style={{color:"#d1d5db",fontSize:"0.8rem",fontFamily:"'Noto Sans KR',sans-serif",lineHeight:1.6}}>{t}</span>
            </div>)}
          </div>
        </div>

        {/* 공부법 */}
        <div style={{background:"#0a0c12",border:"1px solid #1e2230",borderRadius:13,padding:"1.1rem"}}>
          <div style={{color:"#10b981",fontSize:"0.68rem",textTransform:"uppercase",letterSpacing:"0.07em",fontFamily:"'Noto Sans KR',sans-serif",marginBottom:10,fontWeight:700}}>📚 공부법 핵심</div>
          <div style={{display:"flex",flexDirection:"column",gap:5}}>
            {ref.공부법.map((t,i)=><div key={i} style={{display:"flex",gap:8,alignItems:"flex-start",padding:"0.5rem 0.65rem",background:"#0d0f18",borderRadius:8,border:"1px solid #1a1d27"}}>
              <span style={{color:c.text,fontSize:"0.62rem",fontFamily:"'JetBrains Mono',monospace",flexShrink:0,marginTop:2,fontWeight:700}}>{String(i+1).padStart(2,"0")}</span>
              <span style={{color:"#c9cbd4",fontSize:"0.79rem",fontFamily:"'Noto Sans KR',sans-serif",lineHeight:1.65}}>{t}</span>
            </div>)}
          </div>
        </div>

        {/* 오답 코드 정의 */}
        <div style={{background:"#0a0c12",border:"1px solid #1e2230",borderRadius:13,padding:"1.1rem"}}>
          <div style={{color:"#f59e0b",fontSize:"0.68rem",textTransform:"uppercase",letterSpacing:"0.07em",fontFamily:"'Noto Sans KR',sans-serif",marginBottom:10,fontWeight:700}}>🔍 이 과목 오답 코드 의미</div>
          <div style={{display:"flex",flexDirection:"column",gap:5}}>
            {Object.entries(ref.오답분류).map(([code,desc])=><div key={code} style={{display:"flex",gap:8,alignItems:"center"}}>
              <Tag code={code}/><span style={{color:"#6b7280",fontSize:"0.77rem",fontFamily:"'Noto Sans KR',sans-serif"}}>{desc}</span>
            </div>)}
          </div>
        </div>
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
  const [scheduleDate,setScheduleDate]=useState(todayStr());

  useEffect(()=>{save(data);},[data]);

  const addWrong=w=>setData(d=>({...d,wrongs:[...d.wrongs,w]}));
  const updateWrong=w=>setData(d=>({...d,wrongs:d.wrongs.map(e=>e.id===w.id?w:e)}));
  const delWrong=id=>setData(d=>({...d,wrongs:d.wrongs.filter(e=>e.id!==id)}));
  const renameFolder=(key,name)=>setData(d=>({...d,folderNames:{...(d.folderNames||{}),[key]:name}}));

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
    {id:"calendar",label:"달력"},
    {id:"wrongs",label:`오답 (${data.wrongs.length})`},
    {id:"ref",label:"레퍼런스"},
  ];

  return (
    <div style={{minHeight:"100vh",background:"#080910",fontFamily:"'Noto Sans KR',sans-serif"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;800;900&family=JetBrains+Mono:wght@400;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
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
          <div style={{color:"#2d3241",fontSize:"0.62rem",marginTop:1,fontFamily:"'JetBrains Mono',monospace"}}>극상위권 학습 시스템</div>
        </div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap",justifyContent:"flex-end"}}>
          <Btn small color="#ef4444" onClick={()=>{setEditWrong(null);setModal("wrong");}}>오답 등록</Btn>
          <Btn small outline color="#4b5563" onClick={()=>setModal("backup")}>백업</Btn>
        </div>
      </header>

      <main style={{maxWidth:900,margin:"0 auto",padding:"1.4rem 1rem"}}>

        {/* AI 분석 버튼 */}
        <div style={{display:"flex",gap:7,marginBottom:"1.2rem",flexWrap:"wrap"}}>
          {[["주간","week","#6366f1"],["월간","month","#3b82f6"],["3개월","quarter","#10b981"]].map(([l,p,c])=>(
            <button key={p} onClick={()=>setModal(`ai-${p}`)} style={{
              padding:"0.52rem 1rem",borderRadius:9,border:"none",
              background:`linear-gradient(135deg,${c},${c}cc)`,
              color:"white",fontFamily:"'Noto Sans KR',sans-serif",fontWeight:700,fontSize:"0.8rem",cursor:"pointer",
              boxShadow:`0 3px 14px ${c}35`}}>🤖 {l} AI 분석</button>
          ))}
        </div>

        {/* 스탯 */}
        <div style={{display:"flex",gap:8,marginBottom:"1.2rem",flexWrap:"wrap"}}>
          {[
            ["이번 주",`${Math.floor(weekMins/60)}h ${weekMins%60}m`,"#6366f1"],
            ["주간 오답",`${weekWrongs}개`,"#ef4444"],
            ["총 오답",`${data.wrongs.length}개`,"#f59e0b"],
          ].map(([l,v,c])=>(
            <div key={l} style={{background:"#0a0c12",border:"1px solid #1e2230",borderRadius:11,padding:"0.8rem 1rem",flex:1,minWidth:100}}>
              <div style={{color:"#4b5563",fontSize:"0.62rem",textTransform:"uppercase",letterSpacing:"0.06em",fontFamily:"'Noto Sans KR',sans-serif",marginBottom:3}}>{l}</div>
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
              fontFamily:"'Noto Sans KR',sans-serif",fontSize:"0.78rem",fontWeight:tab===t.id?700:400}}>{t.label}</button>
          ))}
        </div>

        <div className="fade" key={tab}>
          {tab==="schedule"&&<ScheduleView data={data} setData={setData} initDate={scheduleDate}/>}
          {tab==="calendar"&&<CalendarView data={data} setData={setData} onSelectDate={d=>{setScheduleDate(d);setTab("schedule");}}/>}
          {tab==="wrongs"&&<WrongFolder wrongs={data.wrongs} onDelete={delWrong} onEdit={w=>{setEditWrong(w);setModal("wrong");}} folderNames={data.folderNames||{}} onRenameFolder={renameFolder}/>}
          {tab==="ref"&&<ReferencePanel wrongs={data.wrongs}/>}
        </div>
      </main>

      {/* 모달 */}
      {modal==="wrong"&&<WrongForm editData={editWrong} onSave={w=>{editWrong?updateWrong(w):addWrong(w);setModal(null);setEditWrong(null);}} onClose={()=>{setModal(null);setEditWrong(null);}}/>}
      {modal==="backup"&&<BackupModal data={data} onImport={d=>setData(d)} onClose={()=>setModal(null)}/>}
      {modal==="ai-week"&&<AIAnalysis data={data} period="week" onClose={()=>setModal(null)}/>}
      {modal==="ai-month"&&<AIAnalysis data={data} period="month" onClose={()=>setModal(null)}/>}
      {modal==="ai-quarter"&&<AIAnalysis data={data} period="quarter" onClose={()=>setModal(null)}/>}
    </div>
  );
}

