// A4 text report, using the PDF standard fonts and Windows-1252 encoding.
const W=595.28,H=841.89,M=42,BOTTOM=H-48;
const special={'€':128,'‚':130,'ƒ':131,'„':132,'…':133,'†':134,'‡':135,'ˆ':136,'‰':137,'Š':138,'‹':139,'Œ':140,'Ž':142,'‘':145,'’':146,'“':147,'”':148,'•':149,'–':150,'—':151,'˜':152,'™':153,'š':154,'›':155,'œ':156,'ž':158,'Ÿ':159};
const hex=text=>Array.from(String(text).normalize('NFC'),c=>{const n=c.codePointAt(0);return (special[c]??(n<=255?n:63)).toString(16).padStart(2,'0');}).join('');
const clock=n=>`${String(Math.floor(n/60)%24).padStart(2,'0')}:${String(n%60).padStart(2,'0')}${n>=1440?' (+1 dia)':''}`;
const minutes=n=>Number.isFinite(n)?`${n} min`:'Por confirmar';
export function reportBlocks(sessions,roomName){
 return [...sessions].sort((a,b)=>a.day-b.day||a.start-b.start||(a.sessionTitle||'').localeCompare(b.sessionTitle||'','pt')).map(s=>{
  const intro=s.club?0:(s.presentationMinutes||0),qa=s.club?0:(s.qaMinutes||0),total=s.duration+intro+qa;
  const lines=[`${s.club?'Evento':'Cinema'} · ${s.generalPublic===false?'Público específico':'Público Geral'}`];
  if(s.name)lines.push(`Secção: ${s.name}`);
  if(!s.club){lines.push(`Apresentação: ${minutes(intro)}`,'Filmes:');for(const [name,duration]of s.films||[])lines.push(`  ${name} — ${minutes(duration)}`);}
  if(qa)lines.push(`Q&A: ${(s.qaNames?.length?s.qaNames:[s.qaName]).filter(Boolean).join(', ')||'Participantes por confirmar'} — ${minutes(qa)}`);
  lines.push(`Duração total: ${minutes(total)}${s.estimated?' (estimada)':''}`);
  if(s.notes?.trim())lines.push(`Detalhes: ${s.notes.trim()}`);
  return {heading:s.sessionTitle||'Sem título',when:`${s.day} novembro 2026 · ${clock(s.start)} – ${clock(s.start+total)} · ${roomName}`,lines};
 });
}
export function buildDetailsPdf({sessions,roomName,filterLabel='',measureText,exportedAt=new Date()}){
 const pages=[];let page,y;
 const text=(value,size=10,bold=false,color='0.12 0.12 0.12')=>`${color} rg BT /${bold?'F2':'F1'} ${size} Tf 1 0 0 1 ${M} ${(H-y).toFixed(2)} Tm <${hex(value)}> Tj ET\n`;
 const wrap=(value,size,bold)=>{
  const lines=[];for(const para of String(value).split(/\r?\n/)){
   let line='';for(const word of para.split(/\s+/)){if(!word)continue;
    if(line&&measureText(line+' '+word,size,bold)>W-2*M){lines.push(line);line='';}
    for(const char of (line?' ':'')+word){if(measureText(line+char,size,bold)>W-2*M){lines.push(line);line='';}line+=char;}
   }lines.push(line);
  }return lines;
 };
 const newPage=()=>{page=[];pages.push(page);y=38;page.push(text('PORTO/POST/DOC 2026 · DETALHES DAS SESSÕES',9,true));y=55;page.push(text(roomName,10));y=67;page.push(`0.85 G ${M} ${H-y} m ${W-M} ${H-y} l S\n`);y=88;};
 const add=(value,size=10,bold=false)=>{for(const line of wrap(value,size,bold)){if(y+size*1.4>BOTTOM)newPage();page.push(text(line,size,bold));y+=size*1.4;}};
 newPage();add(`${sessions.length} ${sessions.length===1?'sessão':'sessões'} · Ordem cronológica`,10,true);
 add('Exportado em '+new Intl.DateTimeFormat('pt-PT',{dateStyle:'short',timeStyle:'short',timeZone:'Europe/Lisbon'}).format(exportedAt),9);
 if(filterLabel)add('Filtros: '+filterLabel,9);y+=14;
 for(const block of reportBlocks(sessions,roomName)){
  const rows=[[block.heading,14,true],[block.when,10,true],...block.lines.map(l=>[l,10,false])];
  const height=rows.reduce((sum,[v,size,b])=>sum+wrap(v,size,b).length*size*1.4,0)+34;
  // Keep normal sessions together; very long notes can continue on the next page.
  if(y+Math.min(height,110)>BOTTOM||(height<BOTTOM-88&&y+height>BOTTOM))newPage();
  for(const [v,size,b]of rows)add(v,size,b);y+=10;page.push(`0.85 G ${M} ${H-y} m ${W-M} ${H-y} l S\n`);y+=24;
 }
 pages.forEach((p,i)=>{y=H-26;p.push(text(`${roomName} · ${i+1} / ${pages.length}`,8,false,'0.4 0.4 0.4'));});
 const objects=['<< /Type /Catalog /Pages 2 0 R >>',`<< /Type /Pages /Count ${pages.length} /Kids [${pages.map((_,i)=>`${5+i*2} 0 R`).join(' ')}] >>`,'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>'];
 pages.forEach((p,i)=>{const content=p.join('');objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${W} ${H}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${6+i*2} 0 R >>`,`<< /Length ${content.length} >>\nstream\n${content}endstream`);});
 let pdf='%PDF-1.4\n',offsets=[0];objects.forEach((obj,i)=>{offsets.push(pdf.length);pdf+=`${i+1} 0 obj\n${obj}\nendobj\n`;});const xref=pdf.length;
 pdf+=`xref\n0 ${offsets.length}\n0000000000 65535 f \n`+offsets.slice(1).map(n=>`${String(n).padStart(10,'0')} 00000 n \n`).join('')+`trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
 return new Blob([pdf],{type:'application/pdf'});
}
export function exportDetailsPdf({sessions,roomName,filterLabel,notify,button}){
 if(!sessions.length){notify('Não há sessões para exportar com estes filtros.');return;}
 button.disabled=true;
 try{
  const ctx=document.createElement('canvas').getContext('2d');
  const blob=buildDetailsPdf({sessions,roomName,filterLabel,measureText:(text,size,bold)=>{ctx.font=`${bold?'bold ':''}${size}px Arial`;return ctx.measureText(text).width;}});
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`PPD26-Detalhes-${roomName.replace(/[^a-z0-9]+/gi,'-')}.pdf`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);notify('PDF de detalhes exportado.');
 }catch(error){console.error(error);notify('Não foi possível exportar os detalhes.');}finally{button.disabled=false;}
}
