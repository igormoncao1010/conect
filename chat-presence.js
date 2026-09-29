/* Não lidas persistentes e atividade efêmera de digitação/gravação. */
let unreadCounts=new Map(),activityStates=new Map(),presenceChannels=new Map(),typingTimer=null;
const baseLoad=load,baseList=list,baseOpen=open,baseToggleRecord=toggleRecord;

async function refreshUnread(){
 if(!user)return;let result=await sb.rpc('get_unread_counts');if(result.error){console.warn('Contagem de não lidas indisponível:',result.error.message);return}unreadCounts=new Map((result.data||[]).map(item=>[item.conversation_id,Number(item.unread_count)]));decorateConversationList();
}
async function markConversationRead(id){
 unreadCounts.delete(id);decorateConversationList();let result=await sb.from('conversation_reads').upsert({conversation_id:id,user_id:user.id,last_read_at:new Date().toISOString()},{onConflict:'conversation_id,user_id'});if(result.error)console.warn('Não foi possível marcar como lida:',result.error.message);
}
function activityLabel(id){let state=activityStates.get(id);if(!state||state.expires<Date.now()){activityStates.delete(id);return ''}return state.kind==='recording'?'gravando áudio…':'digitando…'}
function decorateConversationList(){
 document.querySelectorAll('#list .contact[data-id]').forEach(button=>{let id=button.dataset.id,preview=button.querySelector('.preview'),label=activityLabel(id),count=unreadCounts.get(id)||0;if(preview){if(!preview.dataset.original)preview.dataset.original=preview.textContent;preview.textContent=label||preview.dataset.original;preview.classList.toggle('live-activity',!!label)}let badge=button.querySelector('.unread-badge');if(count&&!badge){badge=document.createElement('em');badge.className='unread-badge';button.append(badge)}if(badge){badge.textContent=count>99?'99+':String(count);badge.classList.toggle('hidden',!count)}});
 let header=$('.chatinfo p');if(active&&header){let label=activityLabel(active.id);header.textContent=label||`Código: ${active.o.user_code}`;header.classList.toggle('live-activity',!!label)}
}
function setupPresenceChannels(){
 rows.forEach(conversation=>{if(presenceChannels.has(conversation.id))return;let channel=sb.channel('chat-activity-'+conversation.id).on('broadcast',{event:'activity'},({payload})=>{if(payload.from===user.id)return;if(payload.kind==='idle')activityStates.delete(conversation.id);else activityStates.set(conversation.id,{kind:payload.kind,expires:Date.now()+5000});decorateConversationList()});channel.subscribe();presenceChannels.set(conversation.id,channel)})
}
function broadcastActivity(kind){let channel=active&&presenceChannels.get(active.id);if(!channel)return;channel.send({type:'broadcast',event:'activity',payload:{from:user.id,kind}}).catch(()=>{})}
function bindActivityInput(){let input=$('#message');if(!input)return;input.addEventListener('input',()=>{broadcastActivity(input.value?'typing':'idle');clearTimeout(typingTimer);typingTimer=setTimeout(()=>broadcastActivity('idle'),2200)});input.addEventListener('blur',()=>broadcastActivity('idle'))}

load=async function(){await baseLoad();setupPresenceChannels();if(active)await markConversationRead(active.id);else await refreshUnread()};
list=function(){baseList();decorateConversationList()};
open=async function(id){await baseOpen(id);await markConversationRead(id);bindActivityInput()};
toggleRecord=async function(){let wasRecording=recorder?.state==='recording';if(wasRecording)broadcastActivity('idle');else setTimeout(()=>{if(recorder?.state==='recording')broadcastActivity('recording')},250);let result=await baseToggleRecord();return result};

document.addEventListener('visibilitychange',()=>{if(document.hidden)broadcastActivity('idle')});
setInterval(decorateConversationList,1500);
(()=>{let style=document.createElement('style');style.textContent=`#list .contact{position:relative}.unread-badge{position:absolute;right:15px;bottom:10px;display:grid;place-items:center;min-width:21px;height:21px;padding:0 6px;border-radius:999px;background:#087a5c;color:#fff;font-style:normal;font-size:.7rem;font-weight:800;box-shadow:0 3px 9px #087a5c3d}.live-activity{color:#07856b!important;font-weight:700}.chatinfo .live-activity::before{content:'';display:inline-block;width:6px;height:6px;border-radius:50%;margin-right:6px;background:#20b98b;animation:activityPulse 1s infinite alternate}@keyframes activityPulse{to{opacity:.35}}`;document.head.append(style)})();
