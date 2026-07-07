import { useState, useEffect } from "react";

// ── 상수 ──────────────────────────────────────────────────────────────────────
const ERROR_CODES = {
  "XM-R":{ label:"XM-R", desc:"독해 오류", detail:"지문/문장 해석 실패", color:"#f97316" },
  "XM-C":{ label:"XM-C", desc:"개념 오류", detail:"개념 자체가 없거나 흐릿함", color:"#ef4444" },
  "XS":  { label:"XS",   desc:"선지/조건 판단", detail:"선지 비교, 조건 적용 실수", color:"#a78bfa" },
  "XD":  { label:"XD",   desc:"주의 실수", detail:"한 단어 오독, 조건 생략 등", color:"#06b6d4" },
  "XR":  { label:"XR",   desc:"처리 오류", detail:"계산·변환·기계적 절차 실수", color:"#3b82f6" },
  "XT-T":{ label:"XT-T", desc:"시간 배분 오류", detail:"투자 시간 대비 비효율", color:"#f59e0b" },
  "XT-M":{ label:"XT-M", desc:"전략 오류", detail:"피드백 루프 미적용·메타인지 실패", color:"#10b981" },
  "XF":  { label:"XF",   desc:"감 풀이", detail:"근거 없이 감으로 선지 선택", color:"#ec4899" },
};
const SUBJECTS = ["수학","영어","국어","과학","사회","한국사","물리","화학","생물","지구과학","기타"];
const FOCUS_LEVELS = ["매우 낮음 😴","낮음 😑","보통 🙂","높음 😤","매우 높음 🔥"];
const STUDY_TYPES = ["개념 학습","문제 풀이","오답 복습","백지 구조화","암기 회독","모의고사","수행평가 준비","기타"];
const DIFFICULTY = ["매우 쉬움","쉬움","보통","어려움","매우 어려움"];
const STORAGE_KEY = "study_os_v4";
const subjectColors = { 수학:"#6366f1",영어:"#10b981",국어:"#f59e0b",과학:"#3b82f6",사회:"#ec4899",한국사:"#8b5cf6",물리:"#06b6d4",화학:"#f97316",생물:"#22c55e",지구과학:"#84cc16",기타:"#9ca3af" };
const focusColors = ["#4b5563","#6b7280","#f59e0b","#10b981","#6366f1"];
const diffColors = ["#22c55e","#84cc16","#f59e0b","#f97316","#ef4444"];
const initialData = { dailyLogs:[], wrongEntries:[], timetableBlocks:[], events:[], folderNames:{} };

function loadData() { try { const r=localStorage.getItem(STORAGE_KEY); return r?JSON.parse(r):initialData; } catch { return initialData; } }
function saveData(d) { try { localStorage.setItem(STORAGE_KEY,JSON.stringify(d)); } catch {} }

// ── 공통 UI ────────────────────────────────────────────────────────────────────
const inp = { width:"100%",background:"#111318",border:"1px solid #1e2230",borderRadius:8,color:"#e8eaf0",padding:"0.62rem 0.85rem",fontSize:"0.88rem",fontFamily:"'Noto Sans KR',sans-serif",boxSizing:"border-box",outline:"none" };
const F = ({label,children,half}) => (
  <div style={{marginBottom:"1rem",gridColumn:half?"span 1":undefined}}>
    <div style={{color:"#4b5563",fontSize:"0.68rem",fontFamily:"'Noto Sans KR',sans-serif",marginBottom:5,textTransform:"uppercase",letterSpacing:"0.07em"}}>{label}</div>
    {children}
  </div>
);
function Modal({title,onClose,children,wide}) {
  return (
    <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.85)",zIndex:999,display:"flex",alignItems:"center",justifyContent:"center",padding:"1rem"}} onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{background:"#0a0c12",border:"1px solid #1e2230",borderRadius:18,padding:"2rem",maxWidth:wide?760:580,width:"100%",maxHeight:"90vh",overflowY:"auto",boxShadow:"0 32px 100px rgba(0,0,0,0.95)"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"1.6rem"}}>
          <h3 style={{color:"#f1f3f9",margin:0,fontSize:"0.97rem",fontFamily:"'Noto Sans KR',sans-serif",fontWeight:800}}>{title}</h3>
          <button onClick={onClose} style={{background:"none",border:"none",color:"#4b5563",fontSize:"1.5rem",cursor:"pointer",lineHeight:1}}>×</button>
        </div>
        {children}
      </div>
    </div>
  );
}
function Btn({children,onClick,color="#6366f1",full,small,outline,disabled}) {
  return <button disabled={disabled} onClick={onClick} style={{padding:small?"0.35rem 0.8rem":"0.75rem 1.4rem",width:full?"100%":undefined,borderRadius:9,border:outline?`1px solid ${color}50`:"none",background:disabled?"#1e2230":outline?`${color}15`:color,color:disabled?"#4b5563":outline?color:"white",fontFamily:"'Noto Sans KR',sans-serif",fontSize:small?"0.75rem":"0.88rem",fontWeight:700,cursor:disabled?"not-allowed":"pointer",opacity:disabled?0.5:1}}>{children}</button>;
}
function Tag({code}) {
  const c=ERROR_CODES[code]; if(!c) return null;
  return <span style={{background:`${c.color}18`,color:c.color,border:`1px solid ${c.color}35`,borderRadius:99,padding:"0.15rem 0.55rem",fontSize:"0.72rem",fontFamily:"'JetBrains Mono',monospace",fontWeight:700}}>{c.label}</span>;
}
function Spinner() {
  return <div style={{textAlign:"center",padding:"3rem 0",color:"#4b5563",fontFamily:"'Noto Sans KR',sans-serif"}}>
    분석 중...
    <div style={{display:"flex",gap:6,justifyContent:"center",marginTop:16}}>
      {[0,1,2].map(i=><div key={i} style={{width:7,height:7,borderRadius:"50%",background:"#6366f1",animation:`pulse 1.2s ${i*0.2}s infinite`}}/>)}
    </div>
  </div>;
}
async function callAI(prompt) {
  const res = await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1000,messages:[{role:"user",content:prompt}]})});
  const json = await res.json();
  return json.content?.map(c=>c.text||"").join("")||"오류";
}

// ── 타임테이블 입력 폼 ─────────────────────────────────────────────────────────
function TimeBlockForm({onSave,onClose,editData}) {
  const [date,setDate]=useState(editData?.date||new Date().toISOString().slice(0,10));
  const [startTime,setStartTime]=useState(editData?.startTime||"09:00");
  const [endTime,setEndTime]=useState(editData?.endTime||"10:00");
  const [subject,setSubject]=useState(editData?.subject||"수학");
  const [studyType,setStudyType]=useState(editData?.studyType||"문제 풀이");
  const [content,setContent]=useState(editData?.content||"");
  const [difficulty,setDifficulty]=useState(editData?.difficulty||2);
  const [focusLevel,setFocusLevel]=useState(editData?.focusLevel||3);
  const [achieveRate,setAchieveRate]=useState(editData?.achieveRate||100);
  const [memo,setMemo]=useState(editData?.memo||"");
  const [energyLevel,setEnergyLevel]=useState(editData?.energyLevel||3);
  const [location,setLocation]=useState(editData?.location||"집");

  function getDuration() {
    const [sh,sm]=startTime.split(":").map(Number);
    const [eh,em]=endTime.split(":").map(Number);
    const mins=(eh*60+em)-(sh*60+sm);
    return mins>0?mins:0;
  }

  return (
    <Modal title={editData?"타임블록 수정":"타임블록 추가"} onClose={onClose} wide>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        <F label="날짜"><input type="date" value={date} onChange={e=>setDate(e.target.value)} style={inp}/></F>
        <F label="공부 장소">
          <select value={location} onChange={e=>setLocation(e.target.value)} style={inp}>
            {["집","도서관","독서실","학교","카페","기타"].map(l=><option key={l}>{l}</option>)}
          </select>
        </F>
        <F label="시작 시간"><input type="time" value={startTime} onChange={e=>setStartTime(e.target.value)} style={inp}/></F>
        <F label="종료 시간">
          <input type="time" value={endTime} onChange={e=>setEndTime(e.target.value)} style={inp}/>
          {getDuration()>0&&<div style={{color:"#6366f1",fontSize:"0.72rem",marginTop:4,fontFamily:"'JetBrains Mono',monospace"}}>{Math.floor(getDuration()/60)}h {getDuration()%60}m</div>}
        </F>
        <F label="과목">
          <select value={subject} onChange={e=>setSubject(e.target.value)} style={inp}>
            {SUBJECTS.map(s=><option key={s}>{s}</option>)}
          </select>
        </F>
        <F label="유형">
          <select value={studyType} onChange={e=>setStudyType(e.target.value)} style={inp}>
            {STUDY_TYPES.map(t=><option key={t}>{t}</option>)}
          </select>
        </F>
      </div>

      <F label="공부 내용 (단원, 범위, 문제집 등)">
        <input value={content} onChange={e=>setContent(e.target.value)} style={inp} placeholder="예: 수학의 정석 미적분 p.120~135, 함수 극한"/>
      </F>

      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:12}}>
        <F label={`난이도 — ${DIFFICULTY[difficulty]}`}>
          <input type="range" min={0} max={4} value={difficulty} onChange={e=>setDifficulty(Number(e.target.value))} style={{width:"100%",accentColor:diffColors[difficulty]}}/>
          <div style={{display:"flex",justifyContent:"space-between",marginTop:4}}>
            {DIFFICULTY.map((d,i)=><span key={i} style={{fontSize:"0.6rem",color:i===difficulty?diffColors[i]:"#2d3241",fontFamily:"'Noto Sans KR',sans-serif"}}>{"●"}</span>)}
          </div>
        </F>
        <F label={`집중도 — ${FOCUS_LEVELS[focusLevel-1]}`}>
          <input type="range" min={1} max={5} value={focusLevel} onChange={e=>setFocusLevel(Number(e.target.value))} style={{width:"100%",accentColor:focusColors[focusLevel-1]}}/>
          <div style={{display:"flex",justifyContent:"space-between",marginTop:4}}>
            {[1,2,3,4,5].map(i=><span key={i} style={{fontSize:"0.6rem",color:i===focusLevel?focusColors[i-1]:"#2d3241"}}>{"●"}</span>)}
          </div>
        </F>
        <F label={`에너지 — ${["매우 낮음","낮음","보통","높음","매우 높음"][energyLevel-1]}`}>
          <input type="range" min={1} max={5} value={energyLevel} onChange={e=>setEnergyLevel(Number(e.target.value))} style={{width:"100%",accentColor:"#f59e0b"}}/>
          <div style={{display:"flex",justifyContent:"space-between",marginTop:4}}>
            {[1,2,3,4,5].map(i=><span key={i} style={{fontSize:"0.6rem",color:i===energyLevel?"#f59e0b":"#2d3241"}}>{"●"}</span>)}
          </div>
        </F>
      </div>

      <F label={`목표 달성률 — ${achieveRate}%`}>
        <input type="range" min={0} max={100} step={5} value={achieveRate} onChange={e=>setAchieveRate(Number(e.target.value))} style={{width:"100%",accentColor:achieveRate>=80?"#22c55e":achieveRate>=50?"#f59e0b":"#ef4444"}}/>
        <div style={{display:"flex",justifyContent:"space-between",marginTop:3}}>
          {[0,25,50,75,100].map(v=><span key={v} style={{fontSize:"0.65rem",color:"#2d3241",fontFamily:"'JetBrains Mono',monospace"}}>{v}%</span>)}
        </div>
      </F>

      <F label="메모 (느낀 점, 이 시간대 특이사항, 공부법 변경 등)">
        <textarea value={memo} onChange={e=>setMemo(e.target.value)} rows={3} style={{...inp,resize:"vertical"}} placeholder="예: 점심 직후라 집중이 잘 안됐음. 다음엔 15분 낮잠 후 시작할 것."/>
      </F>

      <Btn full disabled={getDuration()===0} onClick={()=>{
        onSave({id:editData?.id||Date.now(),date,startTime,endTime,subject,studyType,content,difficulty,focusLevel,achieveRate,memo,energyLevel,location,duration:getDuration()});
        onClose();
      }}>저장</Btn>
    </Modal>
  );
}

// ── 타임테이블 탭 ──────────────────────────────────────────────────────────────
function TimetableTab({blocks,onAdd,onDelete,onEdit}) {
  const [viewDate,setViewDate]=useState(new Date().toISOString().slice(0,10));
  const [viewMode,setViewMode]=useState("day"); // day | week

  // 날짜별 블록
  const dayBlocks = blocks.filter(b=>b.date===viewDate).sort((a,b)=>a.startTime.localeCompare(b.startTime));

  // 주간: 현재 날짜 기준 7일
  const weekDates = Array.from({length:7},(_,i)=>{
    const d=new Date(viewDate); d.setDate(d.getDate()-d.getDay()+i);
    return d.toISOString().slice(0,10);
  });

  // 시간대별 집중도 히트맵용 (0~23시)
  function getHourFocus(date,hour) {
    const b=blocks.filter(bl=>{
      if(bl.date!==date)return false;
      const [sh]=bl.startTime.split(":").map(Number);
      const [eh]=bl.endTime.split(":").map(Number);
      return hour>=sh&&hour<eh;
    });
    if(b.length===0)return null;
    return Math.round(b.reduce((a,x)=>a+x.focusLevel,0)/b.length);
  }

  // 총 공부시간
  const dayTotal = dayBlocks.reduce((a,b)=>a+b.duration,0);

  // 과목별 시간 (일)
  const daySubH={};
  for(const b of dayBlocks)daySubH[b.subject]=(daySubH[b.subject]||0)+b.duration;

  const DAY_KO=["일","월","화","수","목","금","토"];

  return (
    <div>
      {/* 컨트롤 */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"1.2rem",flexWrap:"wrap",gap:8}}>
        <div style={{display:"flex",gap:4,background:"#0a0c12",borderRadius:8,padding:3,border:"1px solid #1e2230"}}>
          {[["day","일간"],["week","주간"]].map(([v,l])=>(
            <button key={v} onClick={()=>setViewMode(v)} style={{padding:"0.4rem 0.9rem",borderRadius:5,border:"none",cursor:"pointer",background:viewMode===v?"#6366f1":"transparent",color:viewMode===v?"white":"#4b5563",fontFamily:"'Noto Sans KR',sans-serif",fontSize:"0.78rem",fontWeight:700}}>{l}</button>
          ))}
        </div>
        <div style={{display:"flex",gap:8,alignItems:"center"}}>
          <input type="date" value={viewDate} onChange={e=>setViewDate(e.target.value)} style={{...inp,width:"auto",fontSize:"0.82rem",padding:"0.4rem 0.7rem"}}/>
          <Btn small color="#6366f1" onClick={onAdd}>+ 블록 추가</Btn>
        </div>
      </div>

      {/* 일간 뷰 */}
      {viewMode==="day"&&(
        <div>
          {/* 요약 */}
          <div style={{display:"flex",gap:8,marginBottom:"1.2rem",flexWrap:"wrap"}}>
            {[
              ["총 공부",`${Math.floor(dayTotal/60)}h ${dayTotal%60}m`,"#6366f1"],
              ["블록 수",`${dayBlocks.length}개`,"#10b981"],
              ["평균 집중도",dayBlocks.length>0?(dayBlocks.reduce((a,b)=>a+b.focusLevel,0)/dayBlocks.length).toFixed(1)+"/5":"-","#a78bfa"],
              ["평균 달성률",dayBlocks.length>0?Math.round(dayBlocks.reduce((a,b)=>a+b.achieveRate,0)/dayBlocks.length)+"%":"-","#f59e0b"],
            ].map(([l,v,c])=>(
              <div key={l} style={{background:"#0a0c12",border:"1px solid #1e2230",borderRadius:10,padding:"0.8rem 1.1rem",flex:1,minWidth:100}}>
                <div style={{color:"#4b5563",fontSize:"0.65rem",textTransform:"uppercase",letterSpacing:"0.06em",fontFamily:"'Noto Sans KR',sans-serif",marginBottom:3}}>{l}</div>
                <div style={{color:c,fontSize:"1.3rem",fontWeight:800,fontFamily:"'JetBrains Mono',monospace",lineHeight:1}}>{v}</div>
              </div>
            ))}
          </div>

          {/* 24시간 타임라인 */}
          <div style={{background:"#0a0c12",border:"1px solid #1e2230",borderRadius:14,padding:"1.2rem",marginBottom:"1.2rem",overflowX:"auto"}}>
            <div style={{color:"#4b5563",fontSize:"0.68rem",textTransform:"uppercase",letterSpacing:"0.07em",fontFamily:"'Noto Sans KR',sans-serif",marginBottom:10}}>시간대별 집중도 히트맵</div>
            <div style={{display:"flex",gap:3,minWidth:500}}>
              {Array.from({length:24},(_,h)=>{
                const f=getHourFocus(viewDate,h);
                const color=f?focusColors[f-1]:"#1e2230";
                return (
                  <div key={h} style={{flex:1,textAlign:"center"}}>
                    <div style={{height:32,background:color,borderRadius:4,marginBottom:4,opacity:f?0.85:0.3,transition:"all 0.2s"}}/>
                    <div style={{color:"#2d3241",fontSize:"0.6rem",fontFamily:"'JetBrains Mono',monospace"}}>{h}</div>
                  </div>
                );
              })}
            </div>
            <div style={{display:"flex",gap:12,marginTop:8,flexWrap:"wrap"}}>
              {focusColors.map((c,i)=>(
                <div key={i} style={{display:"flex",alignItems:"center",gap:4}}>
                  <div style={{width:10,height:10,background:c,borderRadius:2}}/>
                  <span style={{color:"#4b5563",fontSize:"0.65rem",fontFamily:"'Noto Sans KR',sans-serif"}}>{FOCUS_LEVELS[i].split(" ")[0]}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 과목별 시간 바 */}
          {Object.keys(daySubH).length>0&&(
            <div style={{background:"#0a0c12",border:"1px solid #1e2230",borderRadius:14,padding:"1.2rem",marginBottom:"1.2rem"}}>
              <div style={{color:"#4b5563",fontSize:"0.68rem",textTransform:"uppercase",letterSpacing:"0.07em",fontFamily:"'Noto Sans KR',sans-serif",marginBottom:10}}>오늘 과목별 시간</div>
              {Object.entries(daySubH).sort((a,b)=>b[1]-a[1]).map(([sub,mins])=>(
                <div key={sub} style={{marginBottom:8}}>
                  <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                    <span style={{color:subjectColors[sub]||"#6366f1",fontSize:"0.8rem",fontWeight:700,fontFamily:"'Noto Sans KR',sans-serif"}}>{sub}</span>
                    <span style={{color:"#4b5563",fontSize:"0.72rem",fontFamily:"'JetBrains Mono',monospace"}}>{Math.floor(mins/60)}h {mins%60}m</span>
                  </div>
                  <div style={{height:5,background:"#111318",borderRadius:99,overflow:"hidden"}}>
                    <div style={{height:"100%",width:`${(mins/dayTotal)*100}%`,background:subjectColors[sub]||"#6366f1",borderRadius:99}}/>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* 블록 목록 */}
          {dayBlocks.length===0
            ?<div style={{color:"#2d3241",fontSize:"0.85rem",textAlign:"center",padding:"3rem 0",fontFamily:"'Noto Sans KR',sans-serif"}}>이 날 기록 없음. 위에서 + 블록 추가.</div>
            :dayBlocks.map(b=><TimeBlockCard key={b.id} block={b} onDelete={onDelete} onEdit={onEdit}/>)
          }
        </div>
      )}

      {/* 주간 뷰 */}
      {viewMode==="week"&&(
        <div>
          <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:6,marginBottom:"1.2rem"}}>
            {weekDates.map((d,i)=>{
              const db=blocks.filter(b=>b.date===d);
              const totalMins=db.reduce((a,b)=>a+b.duration,0);
              const avgF=db.length>0?(db.reduce((a,b)=>a+b.focusLevel,0)/db.length).toFixed(1):null;
              const isToday=d===new Date().toISOString().slice(0,10);
              return (
                <div key={d} onClick={()=>{setViewDate(d);setViewMode("day");}} style={{background: d===viewDate?"#1e2230":"#0a0c12",border:`1px solid ${isToday?"#6366f1":"#1e2230"}`,borderRadius:10,padding:"0.8rem 0.5rem",cursor:"pointer",textAlign:"center"}}>
                  <div style={{color:isToday?"#6366f1":"#4b5563",fontSize:"0.68rem",fontFamily:"'Noto Sans KR',sans-serif",marginBottom:4}}>{DAY_KO[i]}</div>
                  <div style={{color:"#9ca3af",fontSize:"0.7rem",fontFamily:"'JetBrains Mono',monospace",marginBottom:6}}>{d.slice(5)}</div>
                  <div style={{color:"#f1f3f9",fontSize:"0.9rem",fontWeight:800,fontFamily:"'JetBrains Mono',monospace",lineHeight:1,marginBottom:3}}>
                    {totalMins>0?`${Math.floor(totalMins/60)}h${totalMins%60>0?` ${totalMins%60}m`:""}`:"-"}
                  </div>
                  {avgF&&<div style={{color:focusColors[Math.round(Number(avgF))-1],fontSize:"0.68rem",fontFamily:"'Noto Sans KR',sans-serif"}}>집중 {avgF}</div>}
                  {/* 과목 색 도트 */}
                  <div style={{display:"flex",gap:2,justifyContent:"center",marginTop:5,flexWrap:"wrap"}}>
                    {[...new Set(db.map(b=>b.subject))].slice(0,4).map(s=>(
                      <div key={s} style={{width:5,height:5,borderRadius:"50%",background:subjectColors[s]||"#6366f1"}}/>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>

          {/* 주간 집중도 히트맵 */}
          <div style={{background:"#0a0c12",border:"1px solid #1e2230",borderRadius:14,padding:"1.2rem",marginBottom:"1.2rem",overflowX:"auto"}}>
            <div style={{color:"#4b5563",fontSize:"0.68rem",textTransform:"uppercase",letterSpacing:"0.07em",fontFamily:"'Noto Sans KR',sans-serif",marginBottom:12}}>주간 시간대별 집중도</div>
            <div style={{display:"grid",gridTemplateColumns:"auto repeat(24,1fr)",gap:3,minWidth:600}}>
              <div/>
              {Array.from({length:24},(_,h)=>(
                <div key={h} style={{color:"#2d3241",fontSize:"0.55rem",textAlign:"center",fontFamily:"'JetBrains Mono',monospace"}}>{h}</div>
              ))}
              {weekDates.map((d,di)=>[
                <div key={`l${d}`} style={{color:"#4b5563",fontSize:"0.65rem",fontFamily:"'Noto Sans KR',sans-serif",display:"flex",alignItems:"center"}}>{DAY_KO[di]}</div>,
                ...Array.from({length:24},(_,h)=>{
                  const f=getHourFocus(d,h);
                  return <div key={h} style={{height:16,background:f?focusColors[f-1]:"#111318",borderRadius:3,opacity:f?0.8:0.2}}/>;
                })
              ])}
            </div>
          </div>

          {/* 주간 과목별 누적 */}
          <div style={{background:"#0a0c12",border:"1px solid #1e2230",borderRadius:14,padding:"1.2rem"}}>
            <div style={{color:"#4b5563",fontSize:"0.68rem",textTransform:"uppercase",letterSpacing:"0.07em",fontFamily:"'Noto Sans KR',sans-serif",marginBottom:10}}>주간 과목별 누적 시간</div>
            {(()=>{
              const wSubH={};
              for(const b of blocks.filter(b=>weekDates.includes(b.date)))wSubH[b.subject]=(wSubH[b.subject]||0)+b.duration;
              const wTotal=Object.values(wSubH).reduce((a,b)=>a+b,0)||1;
              return Object.keys(wSubH).length===0
                ?<div style={{color:"#2d3241",fontSize:"0.82rem",textAlign:"center",padding:"1rem 0",fontFamily:"'Noto Sans KR',sans-serif"}}>기록 없음</div>
                :Object.entries(wSubH).sort((a,b)=>b[1]-a[1]).map(([sub,mins])=>(
                  <div key={sub} style={{marginBottom:10}}>
                    <div style={{display:"flex",justifyContent:"space-between",marginBottom:3}}>
                      <span style={{color:subjectColors[sub]||"#6366f1",fontSize:"0.8rem",fontWeight:700,fontFamily:"'Noto Sans KR',sans-serif"}}>{sub}</span>
                      <span style={{color:"#4b5563",fontSize:"0.72rem",fontFamily:"'JetBrains Mono',monospace"}}>{Math.floor(mins/60)}h {mins%60}m ({((mins/wTotal)*100).toFixed(0)}%)</span>
                    </div>
                    <div style={{height:5,background:"#111318",borderRadius:99,overflow:"hidden"}}>
                      <div style={{height:"100%",width:`${(mins/wTotal)*100}%`,background:subjectColors[sub]||"#6366f1",borderRadius:99}}/>
                    </div>
                  </div>
                ));
            })()}
          </div>
        </div>
      )}
    </div>
  );
}

// ── 타임블록 카드 ──────────────────────────────────────────────────────────────
function TimeBlockCard({block:b,onDelete,onEdit}) {
  const [open,setOpen]=useState(false);
  const dur=`${Math.floor(b.duration/60)}h ${b.duration%60}m`;
  return (
    <div style={{background:"#0a0c12",border:"1px solid #1e2230",borderRadius:12,padding:"1rem 1.2rem",marginBottom:8}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
        <div style={{display:"flex",alignItems:"center",gap:10,flexWrap:"wrap",flex:1}}>
          <span style={{color:"#4b5563",fontSize:"0.75rem",fontFamily:"'JetBrains Mono',monospace",minWidth:100}}>{b.startTime} – {b.endTime}</span>
          <span style={{color:subjectColors[b.subject]||"#6366f1",fontWeight:800,fontSize:"0.88rem",fontFamily:"'Noto Sans KR',sans-serif"}}>{b.subject}</span>
          <span style={{background:"#1e2230",color:"#9ca3af",fontSize:"0.72rem",padding:"0.15rem 0.5rem",borderRadius:99,fontFamily:"'Noto Sans KR',sans-serif"}}>{b.studyType}</span>
          <span style={{color:"#2d3241",fontSize:"0.72rem",fontFamily:"'JetBrains Mono',monospace"}}>{dur}</span>
        </div>
        <div style={{display:"flex",gap:6,alignItems:"center",marginLeft:8}}>
          <button onClick={()=>setOpen(o=>!o)} style={{background:"none",border:"none",color:"#4b5563",cursor:"pointer",fontSize:"0.75rem",fontFamily:"'Noto Sans KR',sans-serif"}}>{open?"접기":"상세"}</button>
          <button onClick={()=>onEdit(b)} style={{background:"none",border:"none",color:"#6366f1",cursor:"pointer",fontSize:"0.75rem"}}>수정</button>
          <button onClick={()=>onDelete(b.id)} style={{background:"none",border:"none",color:"#2d3241",cursor:"pointer",fontSize:"0.85rem"}}>×</button>
        </div>
      </div>

      {/* 인디케이터 바 */}
      <div style={{display:"flex",gap:8,marginTop:8,alignItems:"center"}}>
        <div style={{display:"flex",alignItems:"center",gap:4}}>
          <span style={{color:"#4b5563",fontSize:"0.65rem",fontFamily:"'Noto Sans KR',sans-serif"}}>집중</span>
          <div style={{display:"flex",gap:2}}>{[1,2,3,4,5].map(i=><div key={i} style={{width:6,height:6,borderRadius:"50%",background:i<=b.focusLevel?focusColors[b.focusLevel-1]:"#1e2230"}}/>)}</div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:4}}>
          <span style={{color:"#4b5563",fontSize:"0.65rem",fontFamily:"'Noto Sans KR',sans-serif"}}>난이도</span>
          <div style={{display:"flex",gap:2}}>{[0,1,2,3,4].map(i=><div key={i} style={{width:6,height:6,borderRadius:"50%",background:i<=b.difficulty?diffColors[b.difficulty]:"#1e2230"}}/>)}</div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:4}}>
          <span style={{color:"#4b5563",fontSize:"0.65rem",fontFamily:"'Noto Sans KR',sans-serif"}}>달성</span>
          <span style={{color:b.achieveRate>=80?"#22c55e":b.achieveRate>=50?"#f59e0b":"#ef4444",fontSize:"0.72rem",fontFamily:"'JetBrains Mono',monospace",fontWeight:700}}>{b.achieveRate}%</span>
        </div>
        {b.location&&<span style={{color:"#2d3241",fontSize:"0.65rem",fontFamily:"'Noto Sans KR',sans-serif",marginLeft:"auto"}}>📍{b.location}</span>}
      </div>

      {open&&(
        <div style={{marginTop:10,paddingTop:10,borderTop:"1px solid #1e2230"}}>
          {b.content&&<div style={{color:"#9ca3af",fontSize:"0.8rem",fontFamily:"'Noto Sans KR',sans-serif",marginBottom:6}}><span style={{color:"#4b5563"}}>내용 </span>{b.content}</div>}
          {b.memo&&<div style={{color:"#6b7280",fontSize:"0.78rem",fontFamily:"'Noto Sans KR',sans-serif",lineHeight:1.7,fontStyle:"italic"}}>{b.memo}</div>}
        </div>
      )}
    </div>
  );
}

// ── 오답 폼 (등록 + 수정 + 사진) ──────────────────────────────────────────────
function WrongForm({onSave,onClose,editData}) {
  const [date,setDate]=useState(editData?.date||new Date().toISOString().slice(0,10));
  const [subject,setSubject]=useState(editData?.subject||"수학");
  const [code,setCode]=useState(editData?.code||"XM-C");
  const [problem,setProblem]=useState(editData?.problem||"");
  const [cause,setCause]=useState(editData?.cause||"");
  const [fix,setFix]=useState(editData?.fix||"");
  const [photo,setPhoto]=useState(editData?.photo||null);
  const [photoLoading,setPhotoLoading]=useState(false);

  function handlePhoto(e) {
    const file=e.target.files[0];
    if(!file)return;
    if(file.size>3*1024*1024){alert("사진은 3MB 이하로 올려줘");return;}
    setPhotoLoading(true);
    const reader=new FileReader();
    reader.onload=ev=>{setPhoto(ev.target.result);setPhotoLoading(false);};
    reader.readAsDataURL(file);
  }

  return (
    <Modal title={editData?"오답 수정":"오답 등록"} onClose={onClose}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12,marginBottom:"1rem"}}>
        <F label="날짜"><input type="date" value={date} onChange={e=>setDate(e.target.value)} style={inp}/></F>
        <F label="과목"><select value={subject} onChange={e=>setSubject(e.target.value)} style={inp}>{SUBJECTS.map(s=><option key={s}>{s}</option>)}</select></F>
      </div>
      <F label="오답 코드">
        <select value={code} onChange={e=>setCode(e.target.value)} style={inp}>
          {Object.entries(ERROR_CODES).map(([k,v])=><option key={k} value={k}>{k} — {v.desc} ({v.detail})</option>)}
        </select>
      </F>
      <F label="문제 번호/요약 (선택)"><input value={problem} onChange={e=>setProblem(e.target.value)} style={inp} placeholder="예: 3번, 함수 합성"/></F>
      <F label="문제 사진 (선택 · 최대 3MB)">
        <div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap",marginBottom:photo?8:0}}>
          <input
            type="file"
            accept="image/*"
            capture="environment"
            onChange={handlePhoto}
            style={{
              color:"#6b7280",fontSize:"0.78rem",fontFamily:"'Noto Sans KR',sans-serif",
              background:"#1a1d27",border:"1px dashed #2a2d3a",borderRadius:8,
              padding:"0.45rem 0.7rem",cursor:"pointer",width:"100%"
            }}
          />
          {photo&&<button onClick={()=>setPhoto(null)} style={{background:"none",border:"1px solid #ef444440",borderRadius:6,color:"#ef4444",cursor:"pointer",fontSize:"0.75rem",fontFamily:"'Noto Sans KR',sans-serif",padding:"0.25rem 0.6rem"}}>사진 삭제</button>}
        </div>
        {photoLoading&&<div style={{color:"#6b7280",fontSize:"0.75rem",fontFamily:"'Noto Sans KR',sans-serif"}}>업로드 중...</div>}
        {photo&&<img src={photo} alt="오답사진" style={{marginTop:4,maxWidth:"100%",maxHeight:200,borderRadius:8,border:"1px solid #1e2230",objectFit:"contain",display:"block"}}/>}
      </F>
      <F label="왜 틀렸나 — 구체적으로">
        <textarea value={cause} onChange={e=>setCause(e.target.value)} rows={3} style={{...inp,resize:"vertical"}} placeholder="어떤 사고 과정에서 어디가 틀렸는지 정확히"/>
      </F>
      <F label="다음에 이 유형 보면 어떻게 할 건가">
        <textarea value={fix} onChange={e=>setFix(e.target.value)} rows={2} style={{...inp,resize:"vertical"}} placeholder="구체적 행동으로"/>
      </F>
      <Btn full onClick={()=>{if(!cause.trim())return;onSave({id:editData?.id||Date.now(),date,subject,code,problem,cause,fix,photo});onClose();}}>저장</Btn>
    </Modal>
  );
}

// ── 강화된 오답 AI 분석 + 대화 ────────────────────────────────────────────────
function WrongAnalysis({entries,onClose}) {
  const [loading,setLoading]=useState(true);
  const [initText,setInitText]=useState("");
  const [messages,setMessages]=useState([]);
  const [input,setInput]=useState("");
  const [chatLoading,setChatLoading]=useState(false);

  function buildContext() {
    const byCode={},bySubject={},byCS={};
    for(const e of entries){
      byCode[e.code]=(byCode[e.code]||0)+1;
      bySubject[e.subject]=(bySubject[e.subject]||0)+1;
      const k=e.subject+"/"+e.code;
      byCS[k]=(byCS[k]||0)+1;
    }
    const causeWords={};
    for(const e of entries){const ws=e.cause.split(/\s+/).filter(w=>w.length>2);for(const w of ws)causeWords[w]=(causeWords[w]||0)+1;}
    const topWords=Object.entries(causeWords).sort((a,b)=>b[1]-a[1]).slice(0,8).map(([w])=>w);
    const xfRate=entries.length>0?(((byCode["XF"]||0)/entries.length)*100).toFixed(0):0;
    return "== 오답 데이터 (전체 "+entries.length+"개) ==\n코드별: "+Object.entries(byCode).sort((a,b)=>b[1]-a[1]).map(([k,v])=>k+":"+v+"개("+((v/entries.length)*100).toFixed(0)+"%)").join(" | ")+"\n과목별: "+Object.entries(bySubject).sort((a,b)=>b[1]-a[1]).map(([k,v])=>k+":"+v).join(" | ")+"\n과목+코드 TOP5: "+Object.entries(byCS).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([k,v])=>k+"x"+v).join(", ")+"\n반복 키워드: "+(topWords.join(", ")||"없음")+"\nXF비율: "+xfRate+"% "+(xfRate>20?"경고:높음":"")+"\n최근20개:\n"+entries.slice(-20).map(e=>"["+e.date+"|"+e.subject+"/"+e.code+"] "+(e.problem?e.problem+": ":"")+e.cause+(e.fix?" -> "+e.fix:"")).join("\n");
  }

  const SYS="너는 대한민국 전교 최상위권 달성을 목표로 하는 고등학생의 전담 오답 코치야. 원칙: 1.데이터 기반 분석만 2.근본 원인까지 파고들기 3.즉시 실행 가능한 처방 4.냉정하고 직설적 5.오답코드: XM-R독해 XM-C개념 XS선지조건 XD주의실수 XR처리오류 XT-T시간배분 XT-M전략메타인지 XF감풀이";

  useEffect(()=>{
    if(entries.length===0){setInitText("오답 데이터가 없어. 먼저 등록해줘.");setLoading(false);return;}
    callAI(SYS+"\n\n"+buildContext()+"\n\n초기분석:\n**오답 패턴 진단** 가장 치명적 패턴 2-3개, 왜 반복되는지 원인까지\n**과목별 핵심 문제** 과목마다 다른 오류 양상\n**즉시 처방(코드별)** 내일부터 실행할 구체적 루틴\n**위험 신호** 시험까지 지속되면 어떤 결과인지 냉정하게\n**전교 최상위권 대비** 이 패턴의 의미\n\n마지막에 반드시: 어떤 부분을 더 파고들까? 특정 과목이나 오류 유형에 대해 더 구체적인 전략을 원하면 말해줘.")
    .then(t=>{setInitText(t);setMessages([{role:"assistant",content:t}]);setLoading(false);})
    .catch(()=>{setInitText("오류");setLoading(false);});
  },[]);

  async function sendMessage() {
    if(!input.trim()||chatLoading)return;
    const userMsg={role:"user",content:input.trim()};
    const next=[...messages,userMsg];
    setMessages(next);setInput("");setChatLoading(true);
    const apiMsgs=[
      {role:"user",content:SYS+"\n\n"+buildContext()+"\n\n위 데이터 기반으로 학생 질문에 구체적으로 답해줘."},
      {role:"assistant",content:initText},
      ...next.slice(1)
    ];
    try{
      const res=await fetch("https://api.anthropic.com/v1/messages",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({model:"claude-sonnet-4-20250514",max_tokens:1000,messages:apiMsgs})});
      const json=await res.json();
      setMessages(m=>[...m,{role:"assistant",content:json.content?.map(c=>c.text||"").join("")||"오류"}]);
    }catch{setMessages(m=>[...m,{role:"assistant",content:"오류. 다시 시도해줘."}]);}
    setChatLoading(false);
  }

  return (
    <Modal title="오답 AI 분석 + 대화" onClose={onClose} wide>
      {loading?<Spinner/>:(
        <div>
          <div style={{maxHeight:400,overflowY:"auto",marginBottom:"1rem",display:"flex",flexDirection:"column",gap:10}}>
            {messages.map((m,i)=>(
              <div key={i} style={{display:"flex",justifyContent:m.role==="user"?"flex-end":"flex-start"}}>
                <div style={{maxWidth:"88%",padding:"0.85rem 1rem",borderRadius:12,background:m.role==="user"?"#6366f1":"#111318",border:m.role==="user"?"none":"1px solid #1e2230",color:m.role==="user"?"white":"#c9cbd4",fontSize:"0.82rem",lineHeight:1.85,fontFamily:"'Noto Sans KR',sans-serif",whiteSpace:"pre-wrap"}}>{m.content}</div>
              </div>
            ))}
            {chatLoading&&<div style={{display:"flex",gap:5,padding:"0.5rem 0"}}>{[0,1,2].map(i=><div key={i} style={{width:6,height:6,borderRadius:"50%",background:"#6366f1",animation:"pulse 1.2s "+(i*0.2)+"s infinite"}}/>)}</div>}
          </div>
          <div style={{display:"flex",gap:6,flexWrap:"wrap",marginBottom:8}}>
            {["수학 오답 집중 분석","XF 줄이는 방법","가장 급한 과목 처방","다음 주 오답 목표"].map(q=>(
              <button key={q} onClick={()=>setInput(q)} style={{padding:"0.28rem 0.65rem",borderRadius:99,border:"1px solid #2a2d3a",background:"#111318",color:"#6b7280",fontSize:"0.7rem",fontFamily:"'Noto Sans KR',sans-serif",cursor:"pointer"}}>{q}</button>
            ))}
          </div>
          <div style={{display:"flex",gap:8}}>
            <input value={input} onChange={e=>setInput(e.target.value)} onKeyDown={e=>e.key==="Enter"&&sendMessage()} style={{...inp,flex:1}} placeholder="더 파고들 부분을 말해줘"/>
            <Btn onClick={sendMessage} disabled={chatLoading||!input.trim()}>전송</Btn>
          </div>
        </div>
      )}
    </Modal>
  );
}


function AIPanel({data,period,onClose}) {
  const [loading,setLoading]=useState(true);
  const [text,setText]=useState("");
  useEffect(()=>{
    const cutoff=new Date();
    if(period==="week")cutoff.setDate(cutoff.getDate()-7);
    else if(period==="month")cutoff.setMonth(cutoff.getMonth()-1);
    else cutoff.setMonth(cutoff.getMonth()-3);
    const blocks=data.timetableBlocks.filter(b=>new Date(b.date)>=cutoff);
    const wrongs=data.wrongEntries.filter(w=>new Date(w.date)>=cutoff);
    const pLabel=period==="week"?"주간":period==="month"?"월간":"3개월";
    if(blocks.length===0&&wrongs.length===0){setText("데이터가 없어. 기록을 먼저 쌓아줘.");setLoading(false);return;}
    const totalMins=blocks.reduce((a,b)=>a+b.duration,0);
    const subH={};
    for(const b of blocks)subH[b.subject]=(subH[b.subject]||0)+b.duration;
    const byCode={};
    for(const w of wrongs)byCode[w.code]=(byCode[w.code]||0)+1;
    const avgF=blocks.length>0?(blocks.reduce((a,b)=>a+b.focusLevel,0)/blocks.length).toFixed(1):"-";
    const avgAch=blocks.length>0?Math.round(blocks.reduce((a,b)=>a+b.achieveRate,0)/blocks.length):"-";

    // 시간대별 집중도 패턴
    const hourFocus={};
    for(const b of blocks){
      const [sh]=b.startTime.split(":").map(Number);
      hourFocus[sh]=(hourFocus[sh]||[]);
      hourFocus[sh].push(b.focusLevel);
    }
    const bestHour=Object.entries(hourFocus).sort((a,b)=>b[1].reduce((x,y)=>x+y,0)/b[1].length-a[1].reduce((x,y)=>x+y,0)/a[1].length)[0];

    callAI(`너는 대한민국 전교 최상위권 전문 학습 코치야. ${pLabel} 데이터를 분석해서 보고서를 작성해줘.

총 학습시간: ${Math.floor(totalMins/60)}h ${totalMins%60}m / 평균 집중도: ${avgF}/5 / 평균 달성률: ${avgAch}%
과목별: ${Object.entries(subH).map(([k,v])=>`${k} ${Math.floor(v/60)}h${v%60}m`).join(", ")||"없음"}
최고 집중 시간대: ${bestHour?`${bestHour[0]}시`:"데이터 없음"}
오답(${wrongs.length}개): ${Object.entries(byCode).map(([k,v])=>`${k}x${v}`).join(", ")||"없음"}
오답상세: ${wrongs.slice(-8).map(w=>`${w.subject}/${w.code}: ${w.cause}`).join(" | ")||"없음"}
행사: ${data.events.filter(e=>new Date(e.date)>=cutoff).map(e=>`${e.date} ${e.title}`).join(", ")||"없음"}

[${pLabel} 종합 요약] 핵심 수치와 전반적 평가
[시간 배분] 과목별 투자 시간 적절성과 조정 필요 과목
[황금 시간대] 집중도가 높은 시간대 패턴과 그 시간에 어떤 과목을 배치해야 하는지
[오답 패턴] 지배적 오류 코드와 반복 실수
[병목 진단] 지금 나를 가장 붙잡는 장애물 3가지 구체적으로
[전교 최상위권 비교] 이 패턴 대비 최상위권과의 차이
[즉시 바꿔야 할 것] 다음 주부터 바꿀 것 2-3가지 구체적으로
[다음 ${pLabel} 목표] 측정 가능한 목표 3가지`)
    .then(t=>{setText(t);setLoading(false);}).catch(()=>{setText("오류");setLoading(false);});
  },[]);
  const pLabel=period==="week"?"주간":period==="month"?"월간":"3개월";
  return <Modal title={`AI ${pLabel} 분석`} onClose={onClose} wide>{loading?<Spinner/>:<div style={{color:"#c9cbd4",fontSize:"0.84rem",lineHeight:1.9,fontFamily:"'Noto Sans KR',sans-serif",whiteSpace:"pre-wrap"}}>{text}</div>}</Modal>;
}

// ── 행사 폼 ────────────────────────────────────────────────────────────────────
function EventForm({onSave,onClose}) {
  const [date,setDate]=useState(new Date().toISOString().slice(0,10));
  const [title,setTitle]=useState("");
  const [type,setType]=useState("수행평가");
  return (
    <Modal title="행사/수행평가" onClose={onClose}>
      <F label="날짜"><input type="date" value={date} onChange={e=>setDate(e.target.value)} style={inp}/></F>
      <F label="종류"><select value={type} onChange={e=>setType(e.target.value)} style={inp}>{["수행평가","시험","학교 행사","대회","기타"].map(t=><option key={t}>{t}</option>)}</select></F>
      <F label="제목"><input value={title} onChange={e=>setTitle(e.target.value)} style={inp} placeholder="예: 수학 수행평가 (함수 단원)"/></F>
      <Btn full color="#f59e0b" onClick={()=>{onSave({id:Date.now(),date,title,type});onClose();}}>저장</Btn>
    </Modal>
  );
}

// ── 백업 모달 ──────────────────────────────────────────────────────────────────
function DataModal({data,onImport,onClose}) {
  const [tab,setTab]=useState("export");
  const [importText,setImportText]=useState("");
  const [msg,setMsg]=useState("");
  const [showJson,setShowJson]=useState(false);
  const jsonText=JSON.stringify(data);
  function doExport(){
    try{const blob=new Blob([jsonText],{type:"application/json"});const a=document.createElement("a");a.href=URL.createObjectURL(blob);a.download=`studyos_${new Date().toISOString().slice(0,10)}.json`;a.click();}catch(e){}
    setShowJson(true);
  }
  function doImport(){
    try{
      const p=JSON.parse(importText);
      if(!p.wrongEntries){setMsg("형식 오류");return;}
      onImport({...initialData,...p});setMsg("완료!");
    }catch{setMsg("파싱 오류");}
  }
  return (
    <Modal title="데이터 관리 / 백업" onClose={onClose}>
      <div style={{display:"flex",gap:4,background:"#111318",borderRadius:8,padding:3,marginBottom:"1.4rem",border:"1px solid #1e2230"}}>
        {[["export","내보내기"],["import","가져오기"]].map(([v,l])=>(
          <button key={v} onClick={()=>setTab(v)} style={{flex:1,padding:"0.45rem",borderRadius:5,border:"none",cursor:"pointer",background:tab===v?"#6366f1":"transparent",color:tab===v?"white":"#4b5563",fontFamily:"'Noto Sans KR',sans-serif",fontSize:"0.8rem",fontWeight:700}}>{l}</button>
        ))}
      </div>
      {tab==="export"&&(
        <div>
          <div style={{background:"#111318",border:"1px solid #1e2230",borderRadius:10,padding:"1rem",marginBottom:"1rem"}}>
            <div style={{display:"flex",gap:20,flexWrap:"wrap"}}>
              {[["타임블록",data.timetableBlocks?.length||0],["오답",data.wrongEntries.length],["행사",data.events.length]].map(([l,v])=>(
                <div key={l} style={{textAlign:"center"}}>
                  <div style={{color:"#6366f1",fontSize:"1.4rem",fontWeight:800,fontFamily:"'JetBrains Mono',monospace"}}>{v}</div>
                  <div style={{color:"#4b5563",fontSize:"0.7rem",fontFamily:"'Noto Sans KR',sans-serif"}}>{l}</div>
                </div>
              ))}
            </div>
          </div>
          <p style={{color:"#f59e0b",fontSize:"0.78rem",fontFamily:"'Noto Sans KR',sans-serif",marginBottom:"1rem"}}>캐시 지우기 전에 반드시 백업해둬.</p>
          <Btn full onClick={doExport}>JSON으로 내보내기</Btn>
          {showJson&&(
            <div style={{marginTop:"1rem"}}>
              <div style={{color:"#22c55e",fontSize:"0.78rem",fontFamily:"'Noto Sans KR',sans-serif",marginBottom:8}}>
                📋 아래 텍스트 전체 선택 후 복사 → 구글 드라이브 메모에 저장해둬
              </div>
              <textarea readOnly value={jsonText} rows={6} style={{...inp,resize:"vertical",fontSize:"0.7rem",color:"#6b7280"}} onFocus={e=>e.target.select()}/>
            </div>
          )}
        </div>
      )}
      {tab==="import"&&(
        <div>
          <textarea value={importText} onChange={e=>setImportText(e.target.value)} rows={6} style={{...inp,resize:"vertical",marginBottom:"1rem"}} placeholder="내보낸 JSON 붙여넣기"/>
          {msg&&<div style={{color:msg==="완료!"?"#22c55e":"#ef4444",fontSize:"0.8rem",marginBottom:"0.8rem",fontFamily:"'Noto Sans KR',sans-serif"}}>{msg}</div>}
          <Btn full color="#f59e0b" onClick={doImport}>가져오기 (덮어쓰기)</Btn>
        </div>
      )}
    </Modal>
  );
}

// ── 오답 엔트리 카드 ────────────────────────────────────────────────────────────
function WrongCard({e,onDelete,onEdit}) {
  const [open,setOpen]=useState(false);
  return (
    <div style={{background:"#0d0f18",border:"1px solid #1e2230",borderRadius:10,marginBottom:6,overflow:"hidden"}}>
      <div onClick={()=>setOpen(o=>!o)} style={{padding:"0.75rem 1rem",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
          <span style={{color:"#6b7280",fontSize:"0.68rem",fontFamily:"'JetBrains Mono',monospace"}}>{e.date}</span>
          {e.problem&&<span style={{color:"#9ca3af",fontSize:"0.78rem",fontFamily:"'Noto Sans KR',sans-serif"}}>{e.problem}</span>}
          {!e.problem&&<span style={{color:"#6b7280",fontSize:"0.78rem",fontFamily:"'Noto Sans KR',sans-serif",fontStyle:"italic"}}>{e.cause.slice(0,30)}{e.cause.length>30?"...":""}</span>}
          {e.photo&&<span style={{color:"#f59e0b",fontSize:"0.65rem"}}>📷</span>}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:6}}>
          <button onClick={ev=>{ev.stopPropagation();onEdit(e);}} style={{background:"none",border:"none",color:"#6366f1",cursor:"pointer",fontSize:"0.72rem",fontFamily:"'Noto Sans KR',sans-serif"}}>수정</button>
          <button onClick={ev=>{ev.stopPropagation();onDelete(e.id);}} style={{background:"none",border:"none",color:"#2d3241",cursor:"pointer",fontSize:"0.85rem"}}>x</button>
          <span style={{color:"#2d3241",fontSize:"0.75rem"}}>{open?"^":"v"}</span>
        </div>
      </div>
      {open&&(
        <div style={{padding:"0 1rem 0.9rem 1rem",borderTop:"1px solid #1a1d27"}}>
          <div style={{color:"#9ca3af",fontSize:"0.82rem",fontFamily:"'Noto Sans KR',sans-serif",lineHeight:1.75,marginTop:8}}>{e.cause}</div>
          {e.fix&&<div style={{color:"#10b981",fontSize:"0.78rem",fontFamily:"'Noto Sans KR',sans-serif",marginTop:5}}>to {e.fix}</div>}
          {e.photo&&<img src={e.photo} alt="오답" style={{marginTop:8,maxWidth:"100%",maxHeight:200,borderRadius:8,border:"1px solid #1e2230",objectFit:"contain",display:"block"}}/>}
        </div>
      )}
    </div>
  );
}

// ── 오답 폴더 탭 (과목 > 코드) ─────────────────────────────────────────────────
function WrongTab({entries,onDelete,onEdit,folderNames,onRenameFolder}) {
  const [openSubs,setOpenSubs]=useState({});
  const [openCodes,setOpenCodes]=useState({});
  const [viewMode,setViewMode]=useState("folder");
  const [editingFolder,setEditingFolder]=useState(null);
  const [editingName,setEditingName]=useState("");
  const [fSub,setFSub]=useState("전체");
  const [fCode,setFCode]=useState("전체");

  const bySubject={};
  for(const e of entries){if(!bySubject[e.subject])bySubject[e.subject]=[];bySubject[e.subject].push(e);}

  function toggleSub(sub){setOpenSubs(s=>({...s,[sub]:!s[sub]}));}
  function toggleCode(key){setOpenCodes(s=>({...s,[key]:!s[key]}));}
  function getFolderName(key){return folderNames?.[key]||key;}
  function startRename(e,key,current){e.stopPropagation();setEditingFolder(key);setEditingName(current);}
  function commitRename(){if(editingFolder&&editingName.trim())onRenameFolder(editingFolder,editingName.trim());setEditingFolder(null);}

  const filtered=entries.filter(e=>(fSub==="전체"||e.subject===fSub)&&(fCode==="전체"||e.code===fCode));

  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"1.2rem",flexWrap:"wrap",gap:8}}>
        <div style={{display:"flex",gap:4,background:"#0a0c12",borderRadius:8,padding:3,border:"1px solid #1e2230"}}>
          {[["folder","폴더"],["list","목록"]].map(([v,l])=>(
            <button key={v} onClick={()=>setViewMode(v)} style={{padding:"0.38rem 0.8rem",borderRadius:5,border:"none",cursor:"pointer",background:viewMode===v?"#6366f1":"transparent",color:viewMode===v?"white":"#4b5563",fontFamily:"'Noto Sans KR',sans-serif",fontSize:"0.78rem",fontWeight:700}}>{l}</button>
          ))}
        </div>
        <span style={{color:"#4b5563",fontSize:"0.75rem",fontFamily:"'Noto Sans KR',sans-serif"}}>총 {entries.length}개</span>
      </div>

      {viewMode==="folder"&&(
        <div>
          {Object.keys(bySubject).length===0&&<div style={{color:"#2d3241",fontSize:"0.85rem",textAlign:"center",padding:"3rem 0",fontFamily:"'Noto Sans KR',sans-serif"}}>아직 오답 없음</div>}
          {Object.entries(bySubject).sort((a,b)=>b[1].length-a[1].length).map(([sub,subEntries])=>{
            const subOpen=openSubs[sub];
            const subName=getFolderName(sub);
            const color=subjectColors[sub]||"#6366f1";
            const byCode={};
            for(const e of subEntries){if(!byCode[e.code])byCode[e.code]=[];byCode[e.code].push(e);}
            return (
              <div key={sub} style={{marginBottom:8}}>
                <div style={{background:"#0a0c12",border:"1px solid "+color+"30",borderRadius:12,overflow:"hidden"}}>
                  <div onClick={()=>toggleSub(sub)} style={{padding:"0.9rem 1.1rem",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                    <div style={{display:"flex",alignItems:"center",gap:10}}>
                      <span style={{fontSize:"1rem"}}>{subOpen?"📂":"📁"}</span>
                      {editingFolder===sub
                        ?<input autoFocus value={editingName} onChange={e=>setEditingName(e.target.value)} onBlur={commitRename} onKeyDown={e=>{if(e.key==="Enter")commitRename();e.stopPropagation();}} onClick={e=>e.stopPropagation()} style={{...inp,width:140,padding:"0.25rem 0.5rem",fontSize:"0.85rem"}}/>
                        :<span style={{color:"#f1f3f9",fontWeight:800,fontSize:"0.92rem",fontFamily:"'Noto Sans KR',sans-serif"}}>{subName}</span>
                      }
                      <span style={{background:color+"20",color,fontSize:"0.7rem",padding:"0.12rem 0.5rem",borderRadius:99,fontFamily:"'JetBrains Mono',monospace",fontWeight:700}}>{subEntries.length}</span>
                    </div>
                    <div style={{display:"flex",alignItems:"center",gap:8}}>
                      <button onClick={e=>startRename(e,sub,subName)} style={{background:"none",border:"none",color:"#4b5563",cursor:"pointer",fontSize:"0.7rem",fontFamily:"'Noto Sans KR',sans-serif"}}>이름 수정</button>
                      <span style={{color:"#2d3241",fontSize:"0.75rem"}}>{subOpen?"^":"v"}</span>
                    </div>
                  </div>
                  {subOpen&&(
                    <div style={{padding:"0 0.8rem 0.8rem 0.8rem",borderTop:"1px solid "+color+"20"}}>
                      {Object.entries(byCode).sort((a,b)=>b[1].length-a[1].length).map(([code,codeEntries])=>{
                        const codeKey=sub+"/"+code;
                        const codeOpen=openCodes[codeKey];
                        const codeName=getFolderName(codeKey);
                        const cc=ERROR_CODES[code];
                        const ccolor=cc?.color||"#6b7280";
                        return (
                          <div key={code} style={{marginTop:8,background:"#0d0f18",border:"1px solid "+ccolor+"25",borderRadius:10,overflow:"hidden"}}>
                            <div onClick={()=>toggleCode(codeKey)} style={{padding:"0.65rem 0.9rem",cursor:"pointer",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                              <div style={{display:"flex",alignItems:"center",gap:8}}>
                                <span style={{fontSize:"0.85rem"}}>{codeOpen?"📂":"📁"}</span>
                                {editingFolder===codeKey
                                  ?<input autoFocus value={editingName} onChange={e=>setEditingName(e.target.value)} onBlur={commitRename} onKeyDown={e=>{if(e.key==="Enter")commitRename();e.stopPropagation();}} onClick={e=>e.stopPropagation()} style={{...inp,width:160,padding:"0.22rem 0.5rem",fontSize:"0.8rem"}}/>
                                  :<span style={{color:"#d1d5db",fontWeight:700,fontSize:"0.82rem",fontFamily:"'Noto Sans KR',sans-serif"}}>{codeName}</span>
                                }
                                <Tag code={code}/>
                                <span style={{color:"#4b5563",fontSize:"0.7rem",fontFamily:"'JetBrains Mono',monospace"}}>{codeEntries.length}개</span>
                              </div>
                              <div style={{display:"flex",alignItems:"center",gap:6}}>
                                <button onClick={e=>startRename(e,codeKey,codeName)} style={{background:"none",border:"none",color:"#4b5563",cursor:"pointer",fontSize:"0.68rem",fontFamily:"'Noto Sans KR',sans-serif"}}>수정</button>
                                <span style={{color:"#2d3241",fontSize:"0.72rem"}}>{codeOpen?"^":"v"}</span>
                              </div>
                            </div>
                            {codeOpen&&(
                              <div style={{padding:"0 0.7rem 0.7rem 0.7rem",borderTop:"1px solid "+ccolor+"15"}}>
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
          <div style={{display:"flex",gap:8,marginBottom:"1rem"}}>
            <select value={fSub} onChange={e=>setFSub(e.target.value)} style={{...inp,width:"auto"}}><option>전체</option>{SUBJECTS.map(s=><option key={s}>{s}</option>)}</select>
            <select value={fCode} onChange={e=>setFCode(e.target.value)} style={{...inp,width:"auto"}}><option>전체</option>{Object.keys(ERROR_CODES).map(k=><option key={k}>{k}</option>)}</select>
            <span style={{color:"#4b5563",fontSize:"0.78rem",fontFamily:"'Noto Sans KR',sans-serif",alignSelf:"center"}}>{filtered.length}개</span>
          </div>
          {[...filtered].reverse().map(e=>(
            <div key={e.id} style={{background:"#0a0c12",border:"1px solid #1e2230",borderRadius:12,padding:"1rem",marginBottom:8}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:6}}>
                <div style={{display:"flex",alignItems:"center",gap:8,flexWrap:"wrap"}}>
                  <span style={{color:subjectColors[e.subject]||"#6366f1",fontSize:"0.82rem",fontWeight:800,fontFamily:"'Noto Sans KR',sans-serif"}}>{e.subject}</span>
                  <Tag code={e.code}/>
                  {e.problem&&<span style={{color:"#4b5563",fontSize:"0.75rem",fontFamily:"'Noto Sans KR',sans-serif"}}>{e.problem}</span>}
                </div>
                <div style={{display:"flex",alignItems:"center",gap:6}}>
                  <span style={{color:"#2d3241",fontSize:"0.7rem",fontFamily:"'JetBrains Mono',monospace"}}>{e.date}</span>
                  <button onClick={()=>onEdit(e)} style={{background:"none",border:"none",color:"#6366f1",cursor:"pointer",fontSize:"0.72rem",fontFamily:"'Noto Sans KR',sans-serif"}}>수정</button>
                  <button onClick={()=>onDelete(e.id)} style={{background:"none",border:"none",color:"#2d3241",cursor:"pointer",fontSize:"0.85rem"}}>x</button>
                </div>
              </div>
              <div style={{color:"#9ca3af",fontSize:"0.82rem",fontFamily:"'Noto Sans KR',sans-serif",lineHeight:1.7,marginBottom:e.fix?5:0}}>{e.cause}</div>
              {e.fix&&<div style={{color:"#10b981",fontSize:"0.78rem",fontFamily:"'Noto Sans KR',sans-serif"}}>to {e.fix}</div>}
              {e.photo&&<img src={e.photo} alt="오답" style={{marginTop:8,maxWidth:"100%",maxHeight:160,borderRadius:8,border:"1px solid #1e2230",objectFit:"contain",display:"block"}}/>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── 개요 탭 ────────────────────────────────────────────────────────────────────
function OverviewTab({data}) {
  const now=new Date();
  const last30=data.timetableBlocks.filter(b=>new Date(b.date)>=new Date(now-30*864e5));
  const subH={};
  for(const b of last30)subH[b.subject]=(subH[b.subject]||0)+b.duration;
  const maxSubH=Math.max(...Object.values(subH),0.1);
  const byCode={};
  for(const e of data.wrongEntries)byCode[e.code]=(byCode[e.code]||0)+1;
  const tot=data.wrongEntries.length||1;

  return (
    <div>
      <div style={{color:"#4b5563",fontSize:"0.68rem",textTransform:"uppercase",letterSpacing:"0.07em",fontFamily:"'Noto Sans KR',sans-serif",marginBottom:10}}>이번 달 과목별 학습 시간</div>
      <div style={{background:"#0a0c12",border:"1px solid #1e2230",borderRadius:14,padding:"1.4rem",marginBottom:"1.4rem"}}>
        {Object.keys(subH).length===0
          ?<div style={{color:"#2d3241",fontSize:"0.82rem",textAlign:"center",padding:"1.5rem 0",fontFamily:"'Noto Sans KR',sans-serif"}}>기록 없음 — 타임블록을 추가해봐</div>
          :Object.entries(subH).sort((a,b)=>b[1]-a[1]).map(([sub,mins])=>(
            <div key={sub} style={{marginBottom:10}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                <span style={{color:subjectColors[sub]||"#6366f1",fontWeight:700,fontSize:"0.82rem",fontFamily:"'Noto Sans KR',sans-serif"}}>{sub}</span>
                <span style={{color:"#4b5563",fontSize:"0.72rem",fontFamily:"'JetBrains Mono',monospace"}}>{Math.floor(mins/60)}h {mins%60}m</span>
              </div>
              <div style={{height:5,background:"#111318",borderRadius:99,overflow:"hidden"}}>
                <div style={{height:"100%",width:`${(mins/maxSubH)*100}%`,background:subjectColors[sub]||"#6366f1",borderRadius:99}}/>
              </div>
            </div>
          ))}
      </div>

      <div style={{color:"#4b5563",fontSize:"0.68rem",textTransform:"uppercase",letterSpacing:"0.07em",fontFamily:"'Noto Sans KR',sans-serif",marginBottom:10}}>전체 오답 코드 분포</div>
      <div style={{background:"#0a0c12",border:"1px solid #1e2230",borderRadius:14,padding:"1.4rem",marginBottom:"1.4rem"}}>
        {data.wrongEntries.length===0
          ?<div style={{color:"#2d3241",fontSize:"0.82rem",textAlign:"center",padding:"1rem 0",fontFamily:"'Noto Sans KR',sans-serif"}}>아직 오답 없음</div>
          :Object.entries(byCode).sort((a,b)=>b[1]-a[1]).map(([k,v])=>{
            const c=ERROR_CODES[k];
            return (
              <div key={k} style={{marginBottom:10}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:4,alignItems:"center"}}>
                  <div style={{display:"flex",alignItems:"center",gap:8}}><Tag code={k}/><span style={{color:"#6b7280",fontSize:"0.75rem",fontFamily:"'Noto Sans KR',sans-serif"}}>{c?.desc}</span></div>
                  <span style={{color:"#4b5563",fontSize:"0.75rem",fontFamily:"'JetBrains Mono',monospace"}}>{v} ({((v/tot)*100).toFixed(0)}%)</span>
                </div>
                <div style={{height:4,background:"#111318",borderRadius:99,overflow:"hidden"}}>
                  <div style={{height:"100%",width:`${(v/tot)*100}%`,background:c?.color||"#6366f1",borderRadius:99}}/>
                </div>
              </div>
            );
          })}
      </div>

      <div style={{color:"#4b5563",fontSize:"0.68rem",textTransform:"uppercase",letterSpacing:"0.07em",fontFamily:"'Noto Sans KR',sans-serif",marginBottom:10}}>예정된 행사</div>
      <div style={{background:"#0a0c12",border:"1px solid #1e2230",borderRadius:14,padding:"1.2rem"}}>
        {data.events.filter(e=>new Date(e.date)>=new Date()).length===0
          ?<div style={{color:"#2d3241",fontSize:"0.82rem",textAlign:"center",padding:"0.8rem 0",fontFamily:"'Noto Sans KR',sans-serif"}}>예정된 행사 없음</div>
          :[...data.events].filter(e=>new Date(e.date)>=new Date()).sort((a,b)=>a.date.localeCompare(b.date)).slice(0,5).map(e=>(
            <div key={e.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"0.5rem 0",borderBottom:"1px solid #111318"}}>
              <div>
                <span style={{color:"#e8eaf0",fontSize:"0.85rem",fontFamily:"'Noto Sans KR',sans-serif"}}>{e.title}</span>
                <span style={{marginLeft:8,background:"#f59e0b18",color:"#f59e0b",fontSize:"0.68rem",padding:"0.12rem 0.45rem",borderRadius:99}}>{e.type}</span>
              </div>
              <span style={{color:"#4b5563",fontSize:"0.72rem",fontFamily:"'JetBrains Mono',monospace"}}>{e.date}</span>
            </div>
          ))}
      </div>
    </div>
  );
}

// ── 메인 ──────────────────────────────────────────────────────────────────────
export default function App() {
  const [data,setData]=useState(loadData);
  const [modal,setModal]=useState(null);
  const [tab,setTab]=useState("timetable");
  const [editBlock,setEditBlock]=useState(null);
  const [editWrong,setEditWrong]=useState(null);

  useEffect(()=>{saveData(data);},[data]);

  const addBlock=b=>setData(d=>({...d,timetableBlocks:[...(d.timetableBlocks||[]),b]}));
  const updateBlock=b=>setData(d=>({...d,timetableBlocks:(d.timetableBlocks||[]).map(x=>x.id===b.id?b:x)}));
  const delBlock=id=>setData(d=>({...d,timetableBlocks:(d.timetableBlocks||[]).filter(b=>b.id!==id)}));
  const addWrong=w=>setData(d=>({...d,wrongEntries:[...d.wrongEntries,w]}));
  const updateWrong=w=>setData(d=>({...d,wrongEntries:d.wrongEntries.map(e=>e.id===w.id?w:e)}));
  const delWrong=id=>setData(d=>({...d,wrongEntries:d.wrongEntries.filter(e=>e.id!==id)}));
  const renameFolder=(key,name)=>setData(d=>({...d,folderNames:{...(d.folderNames||{}),[key]:name}}));
  const addEvent=e=>setData(d=>({...d,events:[...d.events,e]}));

  const now=new Date();
  const last7blocks=(data.timetableBlocks||[]).filter(b=>new Date(b.date)>=new Date(now-7*864e5));
  const weekMins=last7blocks.reduce((a,b)=>a+b.duration,0);
  const weekW=data.wrongEntries.filter(w=>new Date(w.date)>=new Date(now-7*864e5)).length;
  const avgF=last7blocks.length>0?(last7blocks.reduce((a,b)=>a+b.focusLevel,0)/last7blocks.length).toFixed(1):"-";
  const avgAch=last7blocks.length>0?Math.round(last7blocks.reduce((a,b)=>a+b.achieveRate,0)/last7blocks.length):"-";

  const tabs=[{id:"timetable",label:"타임테이블"},{id:"wrongs",label:`오답 (${data.wrongEntries.length})`},{id:"overview",label:"개요"},{id:"events",label:"행사"}];

  return (
    <div style={{minHeight:"100vh",background:"#080910",fontFamily:"'Noto Sans KR',sans-serif"}}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Noto+Sans+KR:wght@400;500;700;800;900&family=JetBrains+Mono:wght@400;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;}
        @keyframes pulse{0%,100%{opacity:0.3;transform:scale(0.8)}50%{opacity:1;transform:scale(1)}}
        @keyframes fadeUp{from{opacity:0;transform:translateY(10px)}to{opacity:1;transform:translateY(0)}}
        .card{animation:fadeUp 0.3s ease forwards;}
        button{transition:opacity 0.15s;}button:hover{opacity:0.8;}
        input[type=range]{-webkit-appearance:none;height:4px;border-radius:2px;background:#1e2230;}
        input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:14px;height:14px;border-radius:50%;cursor:pointer;}
        ::-webkit-scrollbar{width:4px;}::-webkit-scrollbar-thumb{background:#1e2230;border-radius:2px;}
      `}</style>

      <header style={{borderBottom:"1px solid #13151e",padding:"1.1rem 1.8rem",display:"flex",justifyContent:"space-between",alignItems:"center",position:"sticky",top:0,background:"rgba(8,9,16,0.97)",backdropFilter:"blur(16px)",zIndex:100}}>
        <div>
          <div style={{color:"#f1f3f9",fontSize:"1rem",fontWeight:900,fontFamily:"'JetBrains Mono',monospace",letterSpacing:"-0.02em"}}>STUDY<span style={{color:"#6366f1"}}>_OS</span></div>
          <div style={{color:"#2d3241",fontSize:"0.65rem",marginTop:1,fontFamily:"'JetBrains Mono',monospace"}}>극상위권 학습 시스템</div>
        </div>
        <div style={{display:"flex",gap:6,flexWrap:"wrap",justifyContent:"flex-end"}}>
          <Btn small color="#6366f1" onClick={()=>{setEditBlock(null);setModal("block");}}>+ 타임블록</Btn>
          <Btn small outline color="#ef4444" onClick={()=>{setEditWrong(null);setModal("wrong");}}>오답 등록</Btn>
          <Btn small outline color="#f59e0b" onClick={()=>setModal("event")}>행사</Btn>
          <Btn small outline color="#4b5563" onClick={()=>setModal("data")}>백업</Btn>
        </div>
      </header>

      <main style={{maxWidth:880,margin:"0 auto",padding:"1.6rem 1.2rem"}}>

        {/* AI 분석 버튼 */}
        <div style={{display:"flex",gap:8,marginBottom:"1.4rem",flexWrap:"wrap"}}>
          {[["주간","week","#6366f1"],["월간","month","#3b82f6"],["3개월","quarter","#10b981"]].map(([l,p,c])=>(
            <button key={p} onClick={()=>setModal(`ai-${p}`)} style={{padding:"0.55rem 1.1rem",borderRadius:9,border:"none",background:`linear-gradient(135deg,${c},${c}bb)`,color:"white",fontFamily:"'Noto Sans KR',sans-serif",fontWeight:700,fontSize:"0.8rem",cursor:"pointer",boxShadow:`0 4px 16px ${c}35`}}>AI {l} 분석</button>
          ))}
          <button onClick={()=>setModal("wrong-ai")} style={{padding:"0.55rem 1.1rem",borderRadius:9,border:"1px solid #ef444440",background:"#ef444412",color:"#ef4444",fontFamily:"'Noto Sans KR',sans-serif",fontWeight:700,fontSize:"0.8rem",cursor:"pointer"}}>오답 패턴 분석</button>
        </div>

        {/* 스탯 */}
        <div style={{display:"flex",gap:8,marginBottom:"1.4rem",flexWrap:"wrap"}}>
          {[
            ["이번 주",`${Math.floor(weekMins/60)}h ${weekMins%60}m`,`${last7blocks.length}블록`,"#6366f1"],
            ["주간 오답",`${weekW}개`,"7일","#ef4444"],
            ["평균 집중도",`${avgF}/5`,"최근 7일","#a78bfa"],
            ["평균 달성률",`${avgAch}%`,"최근 7일","#10b981"],
            ["총 오답",`${data.wrongEntries.length}개`,"전체","#f59e0b"],
          ].map(([l,v,s,c])=>(
            <div key={l} style={{background:"#0a0c12",border:"1px solid #1e2230",borderRadius:11,padding:"0.9rem 1rem",flex:1,minWidth:100}}>
              <div style={{color:"#4b5563",fontSize:"0.65rem",textTransform:"uppercase",letterSpacing:"0.06em",fontFamily:"'Noto Sans KR',sans-serif",marginBottom:3}}>{l}</div>
              <div style={{color:c,fontSize:"1.4rem",fontWeight:800,fontFamily:"'JetBrains Mono',monospace",lineHeight:1}}>{v}</div>
              <div style={{color:"#2d3241",fontSize:"0.68rem",marginTop:3,fontFamily:"'Noto Sans KR',sans-serif"}}>{s}</div>
            </div>
          ))}
        </div>

        {/* 탭 */}
        <div style={{display:"flex",gap:3,background:"#0a0c12",borderRadius:10,padding:3,border:"1px solid #1e2230",marginBottom:"1.4rem"}}>
          {tabs.map(t=>(
            <button key={t.id} onClick={()=>setTab(t.id)} style={{flex:1,padding:"0.45rem 0.4rem",borderRadius:7,border:"none",cursor:"pointer",background:tab===t.id?"linear-gradient(135deg,#6366f1,#8b5cf6)":"transparent",color:tab===t.id?"white":"#4b5563",fontFamily:"'Noto Sans KR',sans-serif",fontSize:"0.76rem",fontWeight:tab===t.id?700:400}}>{t.label}</button>
          ))}
        </div>

        <div className="card">
          {tab==="timetable"&&<TimetableTab blocks={data.timetableBlocks||[]} onAdd={()=>{setEditBlock(null);setModal("block");}} onDelete={delBlock} onEdit={b=>{setEditBlock(b);setModal("block");}}/>}
          {tab==="wrongs"&&<WrongTab entries={data.wrongEntries} onDelete={delWrong} onEdit={w=>{setEditWrong(w);setModal("wrong");}} folderNames={data.folderNames||{}} onRenameFolder={renameFolder}/>}
          {tab==="overview"&&<OverviewTab data={data}/>}
          {tab==="events"&&(
            data.events.length===0
              ?<div style={{color:"#2d3241",fontSize:"0.85rem",textAlign:"center",padding:"3rem 0",fontFamily:"'Noto Sans KR',sans-serif"}}>행사 없음</div>
              :[...data.events].sort((a,b)=>b.date.localeCompare(a.date)).map(e=>(
                <div key={e.id} style={{background:"#0a0c12",border:"1px solid #1e2230",borderRadius:12,padding:"1.1rem",marginBottom:8,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
                  <div>
                    <span style={{color:"#f1f3f9",fontWeight:700,fontSize:"0.88rem",fontFamily:"'Noto Sans KR',sans-serif"}}>{e.title}</span>
                    <span style={{marginLeft:8,background:"#f59e0b18",color:"#f59e0b",fontSize:"0.7rem",padding:"0.15rem 0.5rem",borderRadius:99}}>{e.type}</span>
                  </div>
                  <span style={{color:"#4b5563",fontSize:"0.75rem",fontFamily:"'JetBrains Mono',monospace"}}>{e.date}</span>
                </div>
              ))
          )}
        </div>
      </main>

      {modal==="block"&&<TimeBlockForm onSave={b=>{editBlock?updateBlock(b):addBlock(b);setModal(null);setEditBlock(null);}} onClose={()=>{setModal(null);setEditBlock(null);}} editData={editBlock}/>}
      {modal==="wrong"&&<WrongForm editData={editWrong} onSave={w=>{editWrong?updateWrong(w):addWrong(w);setModal(null);setEditWrong(null);}} onClose={()=>{setModal(null);setEditWrong(null);}}/>}
      {modal==="event"&&<EventForm onSave={e=>{addEvent(e);setModal(null);}} onClose={()=>setModal(null)}/>}
      {modal==="data"&&<DataModal data={data} onImport={d=>setData(d)} onClose={()=>setModal(null)}/>}
      {modal==="wrong-ai"&&<WrongAnalysis entries={data.wrongEntries} onClose={()=>setModal(null)}/>}
      {modal==="ai-week"&&<AIPanel data={data} period="week" onClose={()=>setModal(null)}/>}
      {modal==="ai-month"&&<AIPanel data={data} period="month" onClose={()=>setModal(null)}/>}
      {modal==="ai-quarter"&&<AIPanel data={data} period="quarter" onClose={()=>setModal(null)}/>}
    </div>
  );
}
