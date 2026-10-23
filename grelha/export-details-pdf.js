// A4 text report, using the PDF standard fonts and Windows-1252 encoding.
const W=595.28,H=841.89,M=42,BOTTOM=H-48;
const special={'€':128,'‚':130,'ƒ':131,'„':132,'…':133,'†':134,'‡':135,'ˆ':136,'‰':137,'Š':138,'‹':139,'Œ':140,'Ž':142,'‘':145,'’':146,'“':147,'”':148,'•':149,'–':150,'—':151,'˜':152,'™':153,'š':154,'›':155,'œ':156,'ž':158,'Ÿ':159};
const hex=text=>Array.from(String(text).normalize('NFC'),c=>{const n=c.codePointAt(0);return (special[c]??(n<=255?n:63)).toString(16).padStart(2,'0');}).join('');
const clock=n=>`${String(Math.floor(n/60)%24).padStart(2,'0')}:${String(n%60).padStart(2,'0')}${n>=1440?' (+1 dia)':''}`;
const minutes=n=>Number.isFinite(n)?`${n} min`:'Por confirmar';
const sectionColor=name=>{let hash=0;for(const char of (name||''))hash=(hash*31+char.charCodeAt(0))>>>0;return ['#3d678a','#80568d','#a06242','#2f7563','#955069','#69744b','#4f687c','#8b6940'][hash%8];};
const pdfColor=value=>{const n=parseInt(value.replace('#',''),16);return `${((n>>16)&255)/255} ${((n>>8)&255)/255} ${(n&255)/255}`;};
export function reportBlocks(sessions,roomName){
 return [...sessions].sort((a,b)=>a.day-b.day||a.start-b.start||(a.sessionTitle||'').localeCompare(b.sessionTitle||'','pt')).map(s=>{
  const intro=s.club?0:(s.presentationMinutes||0),qa=s.club?0:(s.qaMinutes||0),total=s.duration+intro+qa;
  const rows=[{runs:[{text:s.club?'Evento':'Cinema',bold:true},{text:` · ${s.generalPublic===false?'Público específico':'Público Geral'}`}]}];
  if(s.name)rows.push({runs:[{text:'Secção: ',bold:true},{text:s.name,color:pdfColor(sectionColor(s.name))}]});
  if(!s.club){rows.push({runs:[{text:`Apresentação: ${minutes(intro)}`,bold:true}]});if(s.presenter)rows.push({runs:[{text:'Apresentador: ',bold:true},{text:s.presenter}]});rows.push({runs:[{text:'Filmes:',bold:true}]});for(const [name,duration]of s.films||[])rows.push({runs:[{text:'  '},{text:name,italic:true},{text:` — ${minutes(duration)}`}]});}
  if(qa)rows.push({runs:[{text:'Q&A: ',bold:true},{text:(s.qaNames?.length?s.qaNames:[s.qaName]).filter(Boolean).join(', ')||'Participantes por confirmar'},{text:` — ${minutes(qa)}`}]});
  rows.push({runs:[{text:`Duração total: ${minutes(total)}${s.estimated?' (estimada)':''}`,bold:true}]});
  if(s.club&&s.presenter)rows.push({runs:[{text:'Apresentador: ',bold:true},{text:s.presenter}]});
  if(s.notes?.trim())rows.push({runs:[{text:'Detalhes: ',bold:true},{text:s.notes.trim()}]});
  return {day:s.day,heading:s.sessionTitle||'Sem título',metadata:`${s.day} nov. · ${clock(s.start)}–${clock(s.start+total)} · ${roomName}`,rows};
 });
}
export function buildDetailsPdf({sessions,roomName,filterLabel='',measureText,exportedAt=new Date()}){
 const pages=[];let page,y;
 const lineText=runs=>{
  let x=M,out='BT\n';
  for(const run of runs){const font=run.italic?(run.bold?'F4':'F3'):(run.bold?'F2':'F1'),size=run.size||10,color=run.color||'0.12 0.12 0.12';out+=`/${font} ${size} Tf ${color} rg 1 0 0 1 ${x.toFixed(2)} ${(H-y).toFixed(2)} Tm <${hex(run.text)}> Tj\n`;x+=measureText(run.text,size,!!run.bold,!!run.italic);}
  return out+'ET\n';
 };
 const wrapRuns=runs=>{
  const lines=[];let line=[],width=0;
  const flush=()=>{if(line.length)lines.push(line);line=[];width=0;};
  for(const run of runs){const parts=String(run.text).split(/(\s+)/).filter(Boolean);for(let part of parts){const size=run.size||10,isSpace=/^\s+$/.test(part);if(isSpace&&!line.length)continue;let candidate=part;
    if(!isSpace&&width+measureText(candidate,size,!!run.bold,!!run.italic)>W-2*M&&line.length)flush();
    while(candidate&&measureText(candidate,size,!!run.bold,!!run.italic)>W-2*M){let cut=candidate.length;while(cut>1&&measureText(candidate.slice(0,cut),size,!!run.bold,!!run.italic)>W-2*M)cut--;line.push({...run,text:candidate.slice(0,cut)});width+=measureText(candidate.slice(0,cut),size,!!run.bold,!!run.italic);flush();candidate=candidate.slice(cut);}
    if(candidate){line.push({...run,text:candidate});width+=measureText(candidate,size,!!run.bold,!!run.italic);}
  }}flush();return lines;
 };
 const newPage=day=>{page=[];pages.push(page);y=38;page.push(lineText([{text:'PORTO/POST/DOC 2026 · DETALHES DAS SESSÕES',size:9,bold:true}]));y=58;page.push(lineText([{text:roomName,size:10,bold:true},{text:`   ·   ${day} novembro 2026`,size:10,color:'0.30 0.39 0.48'}]));y=74;page.push(`0.85 G ${M} ${H-y} m ${W-M} ${H-y} l S\n`);y=92;};
 const add=(runs,size=10)=>{runs=runs.map(r=>({...r,size:r.size||size}));for(const line of wrapRuns(runs)){if(y+size*1.4>BOTTOM)throw new Error('As sessões deste dia excedem o espaço disponível numa página.');page.push(lineText(line));y+=size*1.4;}};
 const blocks=reportBlocks(sessions,roomName),byDay=new Map();for(const b of blocks){if(!byDay.has(b.day))byDay.set(b.day,[]);byDay.get(b.day).push(b);}
 for(let day=19;day<=28;day++){
  newPage(day);const today=byDay.get(day)||[];
  add([{text:`${today.length} ${today.length===1?'sessão':'sessões'}`,bold:true},{text:' · Ordem cronológica',color:'0.30 0.39 0.48'}],9);
  if(filterLabel)add([{text:'Filtros: ',bold:true},{text:filterLabel,color:'0.30 0.39 0.48'}],8);
  y+=10;
  if(!today.length)add([{text:'Sem sessões correspondentes aos filtros neste dia.',color:'0.30 0.39 0.48'}],10);
  for(const block of today){
   add([{text:block.heading,size:13,bold:true},{text:'   '},{text:block.metadata,size:9,color:'0.30 0.39 0.48'}],13);
   for(const row of block.rows)add(row.runs,10);
   y+=9;page.push(`0.85 G ${M} ${H-y} m ${W-M} ${H-y} l S\n`);y+=17;
  }
 }
 pages.forEach((p,i)=>{y=H-26;p.push(lineText([{text:`${roomName} · ${i+1} / ${pages.length}`,size:8,color:'0.4 0.4 0.4'}]));});
 const objects=['<< /Type /Catalog /Pages 2 0 R >>',`<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_,i)=>`${7+i*2} 0 R`).join(' ')}] >>`,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-BoldOblique /Encoding /WinAnsiEncoding >>'];
 pages.forEach((p,i)=>{const content=p.join('');objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R /F4 6 0 R >> >> /Contents ${8+i*2} 0 R >>`,`<< /Length ${content.length} >>\nstream\n${content}endstream`);});
 let pdf='%PDF-1.4\n',offsets=[0];objects.forEach((obj,i)=>{offsets.push(pdf.length);pdf+=`${i+1} 0 obj\n${obj}\nendobj\n`;});const xref=pdf.length;
 pdf+=`xref\n0 ${offsets.length}\n0000000000 65535 f \n`+offsets.slice(1).map(n=>`${String(n).padStart(10,'0')} 00000 n \n`).join('')+`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
 return new Blob([pdf],{type:'application/pdf'});
}
export function exportDetailsPdf({sessions,roomName,filterLabel,notify,button}){
 if(!sessions.length){notify('Não há sessões para exportar com estes filtros.');return;}
 button.disabled=true;
 try{
  const ctx=document.createElement('canvas').getContext('2d');
  const blob=buildDetailsPdf({sessions,roomName,filterLabel,measureText:(text,size,bold,italic)=>{ctx.font=`${italic?'italic ':''}${bold?'bold ':''}${size}px Arial`;return ctx.measureText(text).width;}});
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`PPD26-Detalhes-${roomName.replace(/[^a-z0-9]+/gi,'-')}.pdf`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);notify('PDF de detalhes exportado.');
 }catch(error){console.error(error);notify('Não foi possível exportar os detalhes.');}finally{button.disabled=false;}
}
