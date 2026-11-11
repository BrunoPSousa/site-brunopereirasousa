import {connectRoom} from './shared-store.js';

// This module is loaded only by the Master wrapper.
const roomNames={bcc1:'BCC1',bcc2:'BCC2',bcchl:'BCC HL',tmmcn:'TMMCN',plnt:'Planetário',passos:'Passos Manuel',braga:'Braga'};
const currentRoom=location.pathname.split('/').pop().replace('.html','');
if (roomNames[currentRoom] && !document.getElementById('masterAddSession')) {
 const style=document.createElement('style');
 style.textContent=`#masterAddDialog{max-width:660px;width:calc(100% - 28px);max-height:90vh;overflow:auto}#masterAddDialog h2{margin:0 0 20px}#masterAddDialog h3{font-size:14px;color:#777;border-bottom:1px solid #ccc;margin:24px 0 14px;padding-bottom:6px}#masterAddDialog label{display:flex;align-items:center;gap:12px;margin:10px 0;font-weight:bold}#masterAddDialog label>span:first-child{min-width:170px}#masterAddDialog input:not([type=checkbox]),#masterAddDialog select,#masterAddDialog textarea{flex:1;min-width:0}#masterAddDialog textarea{min-height:75px}#masterAddDialog .film-row{display:flex;gap:8px;margin:8px 0}#masterAddDialog .film-row input:first-child{flex:1}#masterAddDialog .film-row input[type=number]{flex:0 0 76px;width:76px}#masterAddDialog .error{color:#a32025;white-space:pre-line}#masterAddDialog .actions{display:flex;justify-content:flex-end;gap:10px;margin-top:24px}#masterAddDialog [hidden]{display:none!important}@media(max-width:600px){#masterAddDialog label{align-items:stretch;flex-direction:column;gap:5px}}`;
 document.head.append(style);
 const button=document.createElement('button');button.type='button';button.id='masterAddSession';button.textContent='Adicionar sessão';
 const old=document.getElementById('newSessionButton');old?.insertAdjacentElement('afterend',button);
 if(old)old.style.setProperty('display','none','important');
 const dialog=document.createElement('dialog');dialog.id='masterAddDialog';dialog.setAttribute('aria-labelledby','masterAddTitle');
 dialog.innerHTML=`<form novalidate><h2 id="masterAddTitle">Adicionar acontecimento</h2>
 <label><span>Sala</span><select name="room">${Object.entries(roomNames).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></label>
 <label><span>Dia</span><select name="day">${Array.from({length:10},(_,i)=>`<option value="${i+19}">${i+19} novembro</option>`).join('')}</select></label>
 <label><span>Hora de início</span><input name="start" type="time" required value="18:00"></label>
 <h3>Tipo e detalhes</h3><label><span>Tipo</span><select name="type"><option value="cinema">Cinema</option><option value="event">Evento</option></select></label>
 <label><span>Público</span><select name="public"><option value="general">Público geral</option><option value="specific">Público específico</option></select></label>
 <label><span>Nome</span><input name="title" maxlength="160" required></label><label><span>Secção</span><input name="section" maxlength="160" required></label>
 <div data-event hidden><label><span>Duração (min)</span><input name="eventDuration" type="number" min="1" max="720" step="1" value="60"></label></div>
 <div data-cinema><h3>Apresentação</h3><label><span>Apresentador (opcional)</span><input name="presenter" maxlength="160"></label><label><span>Convidado (opcional)</span><input name="invitee" maxlength="160"></label><label><span>Duração (min)</span><input name="presentationMinutes" type="number" min="0" max="120" step="1" value="0"></label>
 <h3>Filmes</h3><div data-films></div><button type="button" data-add-film>Adicionar filme</button>
 <label><span>Spotting</span><select name="spotting"><option value="no">Não</option><option value="yes">Sim</option></select></label><label data-legend hidden><span>Legendador (opcional)</span><input name="legendador" maxlength="160"></label>
 <h3>Q&amp;A</h3><label><span>Há Q&amp;A?</span><select name="hasQa"><option value="no">Não</option><option value="yes">Sim</option></select></label><div data-qa hidden><label><span>Moderador (opcional)</span><input name="moderator" maxlength="160"></label><label><span>Convidado</span><input name="qaName" maxlength="160"></label><label><span>Duração (min)</span><input name="qaMinutes" type="number" min="1" max="120" step="1" value="20"></label></div></div>
 <h3>Notas</h3><label><span>Notas (opcional)</span><textarea name="notes" maxlength="500"></textarea></label><p class="error" role="alert" aria-live="polite"></p><div class="actions"><button type="submit" class="primary">Salvar</button><button type="button" data-cancel>Cancelar</button></div></form>`;
 document.body.append(dialog);
 const form=dialog.querySelector('form'),f=form.elements,$=s=>dialog.querySelector(s),rooms={};let saving=false;
 for(const room of Object.keys(roomNames)){rooms[room]={ready:false,rows:[]};rooms[room].remote=connectRoom(room,rows=>rooms[room].rows=rows,(_,ready)=>rooms[room].ready=ready);}
 function filmRow(){const row=document.createElement('div');row.className='film-row';row.innerHTML='<input type="text" maxlength="160" placeholder="Nome do filme" aria-label="Nome do filme"><input type="number" min="1" max="720" step="1" placeholder="min" aria-label="Duração do filme em minutos"><button type="button" aria-label="Remover filme">Remover</button>';row.querySelector('button').onclick=()=>row.remove();$('[data-films]').append(row);}
 function sync(){const cinema=f.type.value==='cinema';$('[data-cinema]').hidden=!cinema;$('[data-event]').hidden=cinema;$('[data-legend]').hidden=f.spotting.value!=='yes';$('[data-qa]').hidden=f.hasQa.value!=='yes';}
 for(const name of ['type','spotting','hasQa'])f[name].onchange=sync;
 $('[data-add-film]').onclick=filmRow;$('[data-cancel]').onclick=()=>dialog.close();
 button.onclick=()=>{form.reset();f.room.value=currentRoom;$('[data-films]').replaceChildren();filmRow();$('.error').textContent='';sync();dialog.showModal();};
 function integer(input,min,max,label){const v=input.value.trim(),n=Number(v);if(!v||!Number.isInteger(n)||n<min||n>max)throw Error(`Indica ${label} entre ${min} e ${max} minutos.`);return n;}
 function time(m){return `${String(Math.floor(m/60)%24).padStart(2,'0')}:${String(m%60).padStart(2,'0')}`;}
 form.onsubmit=async e=>{e.preventDefault();if(saving)return;$('.error').textContent='';try{
  const room=f.room.value,state=rooms[room],day=Number(f.day.value),match=/^(\d\d):(\d\d)$/.exec(f.start.value),club=f.type.value==='event',sessionTitle=f.title.value.trim(),name=f.section.value.trim();
  if(!state?.ready)throw Error('A ligação à sala ainda não está pronta. Aguarda e tenta novamente.');
  if(!match)throw Error('Indica a hora de início.');if(!sessionTitle||!name)throw Error('Preenche o nome e a secção.');
  const start=Number(match[1])*60+Number(match[2]),presentationMinutes=club?0:integer(f.presentationMinutes,0,120,'a duração da apresentação');
  const films=club?[[sessionTitle,integer(f.eventDuration,1,720,'a duração do evento')]]:[...$('[data-films]').children].map(row=>{const [title,minutes]=row.querySelectorAll('input');if(!title.value.trim())throw Error('Indica o nome de cada filme.');return [title.value.trim(),integer(minutes,1,720,'a duração de cada filme')];});
  if(!films.length)throw Error('Adiciona pelo menos um filme.');const duration=films.reduce((n,x)=>n+x[1],0);if(duration>720)throw Error('A duração total dos filmes não pode ultrapassar 720 minutos.');
  const hasQa=!club&&f.hasQa.value==='yes',qaName=hasQa?f.qaName.value.trim():'';if(hasQa&&!qaName)throw Error('Indica o convidado do Q&A.');const qaMinutes=hasQa?integer(f.qaMinutes,1,120,'a duração do Q&A'):0;
  const from=day*1440+start,to=from+duration+presentationMinutes+qaMinutes;const conflicts=state.rows.filter(s=>{const a=s.day*1440+s.start,b=a+s.duration+(s.club?0:s.presentationMinutes+s.qaMinutes);return from<b&&a<to;});
  if(conflicts.length&&!confirm('Este acontecimento sobrepõe-se a:\n\n'+conflicts.map(s=>`${s.day} nov. ${time(s.start)} — ${s.sessionTitle}`).join('\n')+'\n\nQueres guardar na mesma?'))return;
  saving=true;form.querySelector('[type=submit]').disabled=true;
  await state.remote.create({day,start,name,sessionTitle,films,presentationMinutes,qaName,qaMinutes,club,notes:f.notes.value.trim(),presenter:club?'':f.presenter.value.trim(),invitee:club?'':f.invitee.value.trim(),moderator:hasQa?f.moderator.value.trim():'',spotting:!club&&f.spotting.value==='yes',legendador:!club&&f.spotting.value==='yes'?f.legendador.value.trim():'',generalPublic:f.public.value==='general'});
  dialog.close();if(room!==currentRoom&&confirm(`Acontecimento guardado em ${roomNames[room]}. Queres abrir essa sala?`))parent.document.querySelector(`[data-room="${room}"]`)?.click();else alert('Acontecimento guardado.');
 }catch(error){$('.error').textContent=error.message||'Não foi possível guardar. Tenta novamente.';}finally{saving=false;form.querySelector('[type=submit]').disabled=false;}};
}
