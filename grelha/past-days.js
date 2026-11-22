// Os dias do festival passam a anteriores às 23h30, pela hora de Lisboa.
function festivalPastThrough(now=new Date()){
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Lisbon',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(now).filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]));
 const date=Date.UTC(parts.year,parts.month-1,parts.day)-(parts.hour*60+parts.minute<23*60+30?86400000:0);
 const first=Date.UTC(2026,10,1);
 return Math.floor((date-first)/86400000)+1;
}
function updatePastDays(){
 const through=festivalPastThrough();
 document.querySelectorAll('#calendar > .lane').forEach(lane=>lane.toggleAttribute('data-past',Number(lane.dataset.day)<=through));
 document.querySelectorAll('#calendar > .dayhead').forEach(header=>{const day=Number.parseInt(header.querySelector('strong')?.textContent,10);header.toggleAttribute('data-past',Number.isFinite(day)&&day<=through);});
 if(document.body.classList.contains('day-view')){const day=Number(new URLSearchParams(location.search).get('day'))||19;document.body.classList.toggle('past-day',day<=through);}
}
function schedulePastDays(){updatePastDays();setTimeout(schedulePastDays,60000-Date.now()%60000+20);}
new MutationObserver(updatePastDays).observe(document.body,{childList:true,subtree:true});
document.addEventListener('visibilitychange',()=>{if(!document.hidden)updatePastDays();});
schedulePastDays();
