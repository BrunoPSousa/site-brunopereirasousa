import {initializeApp} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js';
import {getFirestore,collection,doc,onSnapshot,runTransaction,serverTimestamp} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import {firebaseConfig} from './firebase-config.js';

const db=getFirestore(initializeApp(firebaseConfig));
const rooms=new Set(['bcc1','bcc2','bcchl','tmmcn','plnt','passos','braga']);

function cleanText(value,max){return typeof value==='string'&&value.trim().length<=max?value.trim():'';}
function readFilms(value){
 if(!Array.isArray(value)||value.length>50)throw Error('Lista de filmes inválida.');
 return value.map(item=>{
  const title=cleanText(Array.isArray(item)?item[0]:item?.title,160);
  const minutes=Array.isArray(item)?item[1]:item?.minutes;
  if(!title||!Number.isInteger(minutes)||minutes<0||minutes>720)throw Error('Filme inválido.');
  return [title,minutes];
 });
}
function readQaNames(value){
 if(!Array.isArray(value)||value.length>20)throw Error('Q&A inválido.');
 return value.map(name=>{const clean=cleanText(name,160);if(!clean)throw Error('Nome de Q&A inválido.');return clean;});
}
function decode(id,value){
 if(!value||value.id!==id||!Number.isInteger(value.day)||value.day<19||value.day>28||
  !Number.isInteger(value.start)||value.start<0||value.start>=1800||
  !Number.isInteger(value.duration)||value.duration<1||value.duration>720||
  !Number.isInteger(value.presentationMinutes)||value.presentationMinutes<0||value.presentationMinutes>120||
  !Number.isInteger(value.qaMinutes)||value.qaMinutes<0||value.qaMinutes>120||
  !Number.isInteger(value.revision)||value.revision<0||
  !cleanText(value.sessionTitle,160)||!cleanText(value.section,160)||
  !['cinema','event'].includes(value.type)||typeof value.generalPublic!=='boolean'||
  typeof value.estimated!=='boolean'||typeof value.notes!=='string'||value.notes.length>500||
  (value.presenter!==undefined&&(typeof value.presenter!=='string'||value.presenter.length>160)))
  throw Error(`Dados inválidos na sessão ${id}.`);
 const films=readFilms(value.films),qaNames=readQaNames(value.qaNames);
 if(value.type==='cinema'&&films.length&&films.reduce((sum,[,minutes])=>sum+minutes,0)!==value.duration)
  throw Error(`Duração dos filmes diferente na sessão ${id}.`);
 if(value.type==='event'&&(value.presentationMinutes!==0||value.qaMinutes!==0||qaNames.length))
  throw Error(`Dados inválidos no evento ${id}.`);
 if((qaNames.length===0)!==(value.qaMinutes===0))throw Error(`Duração do Q&A inválida na sessão ${id}.`);
 return {id,day:value.day,start:value.start,duration:value.duration,
  sessionTitle:value.sessionTitle,name:value.section,films,
  presentationMinutes:value.presentationMinutes,qaNames,qaName:qaNames.join(', '),qaMinutes:value.qaMinutes,
  notes:value.notes,presenter:cleanText(value.presenter,160),club:value.type==='event',generalPublic:value.generalPublic,
  estimated:value.estimated,code:cleanText(value.code,40),_rev:value.revision};
}
function encode(before,after){
 const sessionTitle=cleanText(after.sessionTitle,160),section=cleanText(after.name,160);
 const notes=cleanText(after.notes,500),presenter=cleanText(after.presenter,160),films=readFilms(after.films);
 const club=after.club===true;
 const duration=before?after.duration:films.reduce((sum,[,minutes])=>sum+minutes,0);
 const presentationMinutes=club?0:after.presentationMinutes;
 if(typeof after.notes!=='string'||after.notes.trim().length>500||typeof after.presenter!=='string'||after.presenter.trim().length>160||
  (!club&&typeof after.qaName==='string'&&after.qaName.trim().length>160)||
  !sessionTitle||!section||!Number.isInteger(after.day)||after.day<19||after.day>28||
  !Number.isInteger(after.start)||after.start<0||after.start>=1800||
  !Number.isInteger(duration)||duration<1||duration>720||
  !Number.isInteger(presentationMinutes)||presentationMinutes<0||presentationMinutes>120||
  (!club&&films.length&&films.reduce((sum,[,minutes])=>sum+minutes,0)!==duration))
  throw Error('Os dados da sessão são inválidos.');
 const qaText=club?'':cleanText(after.qaName,160);
 // Conserva os vários nomes migrados quando a caixa de Q&A não foi alterada.
 const qaNames=club?[]:before&&qaText===before.qaName?[...before.qaNames]:qaText?[qaText]:[];
 const qaMinutes=club?0:before&&qaText===before.qaName?before.qaMinutes:qaNames.length?20:0;
 const storedFilms=films.map(([title,minutes])=>({title,minutes}));
 return {id:after.id,day:after.day,start:after.start,duration,sessionTitle,section,
  films:storedFilms,presentationMinutes,qaNames,qaMinutes,notes,presenter,type:club?'event':'cinema',
  generalPublic:after.generalPublic!==false,estimated:!!before?.estimated&&!films.length,
  revision:before?before._rev+1:0,...(after.code?{code:cleanText(after.code,40)}:{}),updatedAt:serverTimestamp()};
}

export function connectRoom(room,onChange,onStatus){
 if(!rooms.has(room))throw Error('Sala inválida.');
 const records=collection(db,'festivalGridCurrent2026',room,'sessions');
 let ready=false,serverReady=false;
 const stop=onSnapshot(records,{includeMetadataChanges:true},snapshot=>{
  try{
   const rows=[];
   snapshot.forEach(item=>rows.push(decode(item.id,item.data())));
   if(!rows.length){ready=false;onStatus('A grelha ainda não foi inicializada no servidor.',false);return;}
   if(!snapshot.metadata.fromCache)serverReady=true;
   ready=serverReady&&!snapshot.metadata.fromCache&&navigator.onLine;
   if(serverReady)onChange(rows);
   onStatus(ready?'Ligado · alterações partilhadas em tempo real':'Sem ligação · edição temporariamente indisponível',ready);
  }catch(error){ready=false;onStatus(error.message,false);}
 },error=>{ready=false;onStatus(error.code==='permission-denied'?'O Firebase ainda não permite o acesso à grelha.':'Não foi possível ligar ao programa partilhado.',false);});
 return {close:stop,
  async create(data){
   if(!ready||!navigator.onLine)throw Error('Sem ligação ao servidor. A sessão não foi guardada.');
   const id='added-'+Date.now().toString(36)+'-'+Math.random().toString(36).slice(2,8);
   const after={...data,id};
   const stored=encode(null,after);
   const reference=doc(records,id);
   await runTransaction(db,async transaction=>{
    if((await transaction.get(reference)).exists())throw Error('Identificador já utilizado. Tenta novamente.');
    transaction.set(reference,stored);
   });
   return decode(id,{...stored,updatedAt:null});
  },
  async save(before,after){
   if(!ready||!navigator.onLine)throw Error('Sem ligação ao servidor. A alteração não foi guardada.');
   if(before.id!==after.id)throw Error('Identificador da sessão inválido.');
   const stored=encode(before,after),reference=doc(records,before.id);
   await runTransaction(db,async transaction=>{
    const snapshot=await transaction.get(reference);
    if(!snapshot.exists())throw Error('Esta sessão já não está disponível.');
    const current=decode(snapshot.id,snapshot.data());
    if(current._rev!==before._rev){
     const error=Error('Outra pessoa alterou esta sessão. Foi carregada a versão mais recente; revê os dados antes de tentar novamente.');
     error.code='edit-conflict';throw error;
    }
    transaction.set(reference,stored);
   });
   return decode(before.id,{...stored,updatedAt:null});
  }};
}
