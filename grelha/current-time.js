// Linha para o próximo intervalo de cinco minutos, pela hora de Lisboa.
function nextFestivalTime(now=new Date()){
 const next=new Date((Math.floor(now.getTime()/300000)+1)*300000);
 const parts=Object.fromEntries(new Intl.DateTimeFormat('en-GB',{timeZone:'Europe/Lisbon',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(next).filter(p=>p.type!=='literal').map(p=>[p.type,Number(p.value)]));
 return {year:parts.year,month:parts.month,day:parts.day,minutes:parts.hour*60+parts.minute};
}
function updateCurrentTimeLine(){
 const calendar=document.getElementById('calendar');
 if(!calendar)return;
 calendar.querySelectorAll('.current-time-line').forEach(line=>line.remove());
 const time=nextFestivalTime();
 if(time.year!==2026||time.month!==11)return;
 const lane=calendar.querySelector('.lane[data-day="'+time.day+'"]');
 if(!lane)return;
 const firstTick=calendar.querySelector('.axis .tick');
 let minTime=600;
 if(firstTick){const match=firstTick.textContent.trim().match(/^(\\d{1,2}):(\\d{2})/);if(match)minTime=Number(match[1])*60+Number(match[2]);}
 const top=(time.minutes-minTime)*1.6,height=Number.parseFloat(lane.style.height);
 if(!Number.isFinite(height)||top<0||top>height)return;
 const line=document.createElement('div');line.className='current-time-line';line.style.top=top+'px';line.setAttribute('aria-hidden','true');
 const label=document.createElement('span');label.textContent=String(Math.floor(time.minutes/60)).padStart(2,'0')+':'+String(time.minutes%60).padStart(2,'0');
 line.append(label);lane.append(line);
}
const currentTimeStyle=document.createElement('style');
currentTimeStyle.textContent='.current-time-line{position:absolute;left:0;right:0;height:2px;background:#d51e38;z-index:9;pointer-events:none}.current-time-line span{position:absolute;right:0;bottom:2px;padding:1px 3px;background:#fff;color:#ac1329;font:700 10px Arial,sans-serif;line-height:1}';
document.head.append(currentTimeStyle);
const currentTimeCalendar=document.getElementById('calendar');
if(currentTimeCalendar){new MutationObserver(updateCurrentTimeLine).observe(currentTimeCalendar,{childList:true});}
document.addEventListener('visibilitychange',()=>{if(!document.hidden)updateCurrentTimeLine();});
function scheduleCurrentTimeLine(){updateCurrentTimeLine();setTimeout(scheduleCurrentTimeLine,300000-Date.now()%300000+25);}
scheduleCurrentTimeLine();
