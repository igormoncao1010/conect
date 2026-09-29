/* Chamadas em grupo efêmeras, em malha WebRTC, limitadas a quatro pessoas. */
let groupRoom=null,pendingGroupInvite=null,groupPicker=null;
const individualHandleSignal=handleSignal,individualEndCall=endCall;

function groupContact(id){return rows.find(row=>row.o.id===id)}
function groupName(id){return id===user.id?(profile?.display_name||'Você'):(groupContact(id)?.o.display_name||'Participante')}
function groupAvatar(id){let contact=groupContact(id);return av(groupName(id),contact?.o.avatar_url||profile?.avatar_url||null)}
function groupSend(type,data={}){if(!groupRoom?.channel)return Promise.resolve();return groupRoom.channel.send({type:'broadcast',event:'group-signal',payload:{type,roomId:groupRoom.id,from:user.id,...data}})}

function ensureGroupPicker(){
 if(groupPicker)return groupPicker;
 groupPicker=document.createElement('section');groupPicker.className='modal hidden group-picker';groupPicker.innerHTML='<div class="card"><h2>Adicionar à ligação</h2><p class="muted">Escolha participantes. O limite é de quatro pessoas.</p><div id="groupChoices" class="group-choices"></div><p id="groupPickerNotice" class="notice"></p><div class="actions"><button id="groupPickerCancel" class="secondary" type="button">Cancelar</button><button id="groupPickerConfirm" class="primary" type="button">Adicionar</button></div></div>';
 document.body.append(groupPicker);$('#groupPickerCancel').onclick=()=>groupPicker.classList.add('hidden');$('#groupPickerConfirm').onclick=confirmGroupPicker;return groupPicker;
}
function openGroupPicker(){
 if(!currentCall&&!groupRoom)return alert('Inicie uma ligação antes de adicionar pessoas.');
 let memberIds=new Set(groupRoom?[...groupRoom.members,...groupRoom.invited]:[user.id,currentCall.conversation.o.id]),available=rows.filter(row=>!memberIds.has(row.o.id)),slots=4-memberIds.size;
 if(slots<=0)return alert('A ligação já tem quatro participantes.');if(!available.length)return alert('Não há outro contato disponível para adicionar.');
 let picker=ensureGroupPicker();picker.dataset.slots=String(slots);$('#groupChoices').innerHTML=available.map(row=>`<label class="group-choice"><input type="checkbox" value="${row.o.id}"><span>${av(row.o.display_name,row.o.avatar_url)}<b>${esc(row.o.display_name)}</b></span></label>`).join('');$('#groupPickerNotice').textContent=`Você pode escolher até ${slots}.`;picker.classList.remove('hidden');
}
async function confirmGroupPicker(){
 let picker=ensureGroupPicker(),slots=Number(picker.dataset.slots),ids=[...picker.querySelectorAll('input:checked')].map(input=>input.value);if(!ids.length)return;if(ids.length>slots)return $('#groupPickerNotice').textContent=`Escolha no máximo ${slots}.`;picker.classList.add('hidden');
 try{if(groupRoom)await inviteGroupContacts(ids);else await convertIndividualToGroup(ids)}catch(error){alert(error.message||'Não foi possível criar a ligação em grupo.')}
}

async function subscribeGroup(room){
 let channel=sb.channel('group-call-'+room.id).on('broadcast',{event:'group-signal'},({payload})=>handleGroupSignal(payload));room.channel=channel;
 await new Promise((resolve,reject)=>{let timer=setTimeout(()=>reject(new Error('Sala temporária indisponível.')),5000);channel.subscribe(status=>{if(status==='SUBSCRIBED'){clearTimeout(timer);resolve()}})});
}
async function acquireGroupMedia(mode){return navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:true},video:mode==='video'?{facingMode:'user'}:false})}
function showGroupStage(){
 prepareCallModal();let modal=$('#callModal'),shell=modal.querySelector('.call-stage-shell');modal.classList.toggle('is-video',groupRoom.mode==='video');modal.classList.remove('hidden');$('#incomingControls').classList.add('hidden');$('#activeControls').classList.remove('hidden');$('#callName').textContent='Ligação em grupo';$('#callStatus').textContent=`${groupRoom.members.size} de 4 participantes`;
 let grid=$('#groupGrid');if(!grid){grid=document.createElement('div');grid.id='groupGrid';grid.className='group-grid';shell.insertBefore(grid,shell.firstChild)}grid.innerHTML='';renderGroupTile(user.id,callStream,true);$('#remoteVideo').style.display='none';$('#localVideo').style.display='none';$('#callIdentity').classList.add('hidden');
}
function updateGroupGrid(){let grid=$('#groupGrid');if(grid)grid.dataset.count=String(grid.children.length)}
function renderGroupTile(id,stream,isLocal=false){let grid=$('#groupGrid');if(!grid)return;let tile=document.getElementById('group-'+id);if(!tile){tile=document.createElement('div');tile.id='group-'+id;tile.className='group-tile'+(isLocal?' is-local':'');tile.innerHTML=`<div class="group-avatar">${groupAvatar(id)}</div><video autoplay playsinline ${isLocal?'muted':''}></video><div class="group-tile-meta"><i></i><span>${esc(groupName(id))}${isLocal?' · você':''}</span></div>`;grid.append(tile)}let video=tile.querySelector('video');if(stream){video.srcObject=stream;video.play().catch(()=>{})}video.style.display=groupRoom.mode==='video'?'block':'none';updateGroupGrid()}
function removeGroupTile(id){document.getElementById('group-'+id)?.remove();updateGroupGrid()}

async function convertIndividualToGroup(extraIds){
 let original=currentCall.conversation,mode=currentCall.mode||'audio',contacts=[original,...extraIds.map(groupContact)].filter(Boolean),unique=[...new Map(contacts.map(row=>[row.o.id,row])).values()].slice(0,3);individualEndCall(true);
 groupRoom={id:crypto.randomUUID(),mode,host:user.id,members:new Set([user.id]),invited:new Set(),peers:new Map(),candidates:new Map(),channel:null};callStream=await acquireGroupMedia(mode);showGroupStage();await subscribeGroup(groupRoom);await inviteGroupContacts(unique.map(row=>row.o.id));
}
async function inviteGroupContacts(ids){
 let free=Math.max(0,4-groupRoom.members.size-groupRoom.invited.size),targets=ids.map(groupContact).filter(Boolean).filter(row=>!groupRoom.members.has(row.o.id)&&!groupRoom.invited.has(row.o.id)).slice(0,free);for(const row of targets){groupRoom.invited.add(row.o.id);let channel=await readyCallChannel(row,groupRoom.mode);await channel.send({type:'broadcast',event:'signal',payload:{type:'group-invite',id:groupRoom.id,roomId:groupRoom.id,from:user.id,to:row.o.id,mode:groupRoom.mode,host:user.id}})}$('#callStatus').textContent='Convite enviado';
}
async function showGroupInvite(c,payload){
 if(currentCall||groupRoom)return;pendingGroupInvite={conversation:c,...payload};showCall(c,payload.mode==='video'?'Videochamada em grupo':'Ligação em grupo',true,payload.mode);$('#callName').textContent='Ligação em grupo';$('#acceptCall').onclick=acceptGroupInvite;$('#endCall').onclick=declineGroupInvite;
}
function declineGroupInvite(){pendingGroupInvite=null;$('#callModal').classList.add('hidden')}
async function acceptGroupInvite(){
 let invite=pendingGroupInvite;if(!invite)return;pendingGroupInvite=null;groupRoom={id:invite.roomId,mode:invite.mode||'audio',host:invite.host,members:new Set([user.id]),invited:new Set(),peers:new Map(),candidates:new Map(),channel:null};try{callStream=await acquireGroupMedia(groupRoom.mode);showGroupStage();await subscribeGroup(groupRoom);await groupSend('join',{name:profile?.display_name||'Participante'})}catch(error){alert(error.message||'Não foi possível entrar na ligação.');endGroupCall(false)}
}

async function createGroupPeer(remoteId,offer){
 if(groupRoom.peers.has(remoteId))return groupRoom.peers.get(remoteId);let pc=new RTCPeerConnection(ICE);groupRoom.peers.set(remoteId,pc);callStream.getTracks().forEach(track=>pc.addTrack(track,callStream));pc.onicecandidate=event=>event.candidate&&groupSend('candidate',{to:remoteId,candidate:event.candidate.toJSON()});pc.ontrack=event=>renderGroupTile(remoteId,event.streams[0]);pc.onconnectionstatechange=()=>{if(['failed','closed'].includes(pc.connectionState)){pc.close();groupRoom?.peers.delete(remoteId);groupRoom?.members.delete(remoteId);removeGroupTile(remoteId);updateGroupCount()}};
 if(offer){await pc.setRemoteDescription(offer);let answer=await pc.createAnswer();await pc.setLocalDescription(answer);await groupSend('answer',{to:remoteId,description:answer})}return pc;
}
async function offerGroupPeer(remoteId){let pc=await createGroupPeer(remoteId);let offer=await pc.createOffer({offerToReceiveAudio:true,offerToReceiveVideo:groupRoom.mode==='video'});await pc.setLocalDescription(offer);await groupSend('offer',{to:remoteId,description:offer})}
async function flushGroupCandidates(remoteId){let pc=groupRoom.peers.get(remoteId),items=groupRoom.candidates.get(remoteId)||[];if(pc?.remoteDescription)for(const candidate of items)await pc.addIceCandidate(candidate);groupRoom.candidates.delete(remoteId)}
function updateGroupCount(){if(groupRoom)$('#callStatus').textContent=`${groupRoom.members.size} de 4 participantes`}
async function handleGroupSignal(payload){
 if(!groupRoom||payload.roomId!==groupRoom.id||payload.from===user.id)return;let remoteId=payload.from;if(payload.to&&payload.to!==user.id)return;
 try{if(payload.type==='join'){if(groupRoom.members.size>=4)return;groupRoom.invited.delete(remoteId);groupRoom.members.add(remoteId);updateGroupCount();await offerGroupPeer(remoteId)}else if(payload.type==='offer'){groupRoom.members.add(remoteId);updateGroupCount();await createGroupPeer(remoteId,payload.description);await flushGroupCandidates(remoteId)}else if(payload.type==='answer'){let pc=groupRoom.peers.get(remoteId);if(pc){await pc.setRemoteDescription(payload.description);await flushGroupCandidates(remoteId)}}else if(payload.type==='candidate'){let candidate=new RTCIceCandidate(payload.candidate),pc=groupRoom.peers.get(remoteId);if(pc?.remoteDescription)await pc.addIceCandidate(candidate);else{let items=groupRoom.candidates.get(remoteId)||[];items.push(candidate);groupRoom.candidates.set(remoteId,items)}}else if(payload.type==='leave'){groupRoom.peers.get(remoteId)?.close();groupRoom.peers.delete(remoteId);groupRoom.members.delete(remoteId);removeGroupTile(remoteId);updateGroupCount()}}catch(error){console.error('Falha na chamada em grupo',error)}
}
async function endGroupCall(notify=true){
 let room=groupRoom;if(!room)return;if(notify)await groupSend('leave').catch(()=>{});room.peers.forEach(pc=>pc.close());callStream?.getTracks().forEach(track=>track.stop());callStream=null;groupRoom=null;currentCall=null;pendingCandidates=[];if(room.channel){await room.channel.unsubscribe().catch(()=>{});sb.removeChannel(room.channel)}document.getElementById('groupGrid')?.remove();$('#callModal').classList.add('hidden');
}

handleSignal=async function(c,payload){if(payload.type==='group-invite'&&payload.to===user.id)return showGroupInvite(c,payload);return individualHandleSignal(c,payload)};
endCall=function(notify=true){return groupRoom?endGroupCall(notify):individualEndCall(notify)};
document.addEventListener('click',event=>{if(event.target.closest('#addParticipant')){event.preventDefault();event.stopImmediatePropagation();openGroupPicker()}},true);

(()=>{let style=document.createElement('style');style.textContent=`.group-picker{z-index:110}.group-picker .card{border:1px solid #dce8e5}.group-choices{display:grid;gap:8px;max-height:44vh;overflow:auto;margin:16px 0}.group-choice{display:block}.group-choice>span{display:flex;align-items:center;gap:12px;padding:10px;border:1px solid #d9e3e1;border-radius:14px;transition:.18s}.group-choice input{position:absolute;opacity:0}.group-choice input:checked+span{border-color:#087a5c;background:#eaf7f2;box-shadow:0 0 0 2px #087a5c22}.group-choice .avatar{width:42px;height:42px}.group-grid{position:absolute;inset:0;z-index:1;display:grid;gap:8px;padding:8px;background:radial-gradient(circle at 50% 0,#173c38,#061211 72%)}.group-grid[data-count="1"]{grid-template-columns:1fr}.group-grid[data-count="2"]{grid-template-columns:repeat(2,minmax(0,1fr))}.group-grid[data-count="3"]{grid-template-columns:repeat(2,minmax(0,1fr));grid-template-rows:repeat(2,minmax(0,1fr))}.group-grid[data-count="3"] .group-tile:first-child{grid-row:1 / span 2}.group-grid[data-count="4"]{grid-template-columns:repeat(2,minmax(0,1fr));grid-template-rows:repeat(2,minmax(0,1fr))}.group-tile{position:relative;display:grid;place-items:center;overflow:hidden;border-radius:18px;background:linear-gradient(145deg,#1c4843,#081817);box-shadow:inset 0 0 0 1px #ffffff12}.group-tile video{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}.group-tile.is-local{box-shadow:inset 0 0 0 2px #49c6a5}.group-tile-meta{position:absolute;z-index:2;left:10px;bottom:10px;display:flex;align-items:center;gap:6px;padding:6px 9px;border-radius:12px;background:#061312b8;color:#fff;font-size:.76rem;backdrop-filter:blur(10px)}.group-tile-meta i{width:7px;height:7px;border-radius:50%;background:#49d49f;box-shadow:0 0 0 3px #49d49f22}.group-avatar .avatar{width:92px;height:92px;font-size:30px;box-shadow:0 16px 34px #0005}.call-stage .group-grid~#remoteVideo,.call-stage .group-grid~#localVideo{display:none!important}@media(max-width:640px){.group-grid{gap:4px;padding:4px}.group-tile{border-radius:13px}.group-grid[data-count="3"] .group-tile:first-child{grid-column:1 / span 2;grid-row:auto}.group-tile-meta{left:7px;bottom:7px;max-width:calc(100% - 14px);overflow:hidden;white-space:nowrap}.group-avatar .avatar{width:72px;height:72px;font-size:24px}}`;document.head.append(style)})();
