const tg = window.Telegram?.WebApp;
const isTelegram = Boolean(tg?.initData);
if (tg) {
  tg.ready(); tg.expand();
  tg.setHeaderColor?.("#061524"); tg.setBackgroundColor?.("#061524");
}

let state = { user:{firstName:"Влад",level:1,xp:0,xpToNext:500,money:500,energy:100,reputation:0,premium:false}, tasks:[], leaderboard:[] };
const $ = (id) => document.getElementById(id);
const headers = () => isTelegram ? {"content-type":"application/json","x-tg-init-data":tg.initData} : {"content-type":"application/json","x-demo-user":"1"};
async function api(path, method="POST", body={}){
  const r = await fetch(path,{method,headers:headers(),body:method === "GET" ? undefined : JSON.stringify(body)});
  const data = await r.json().catch(()=>({}));
  if(!r.ok) throw new Error(data.error || "Ошибка");
  return data;
}
function money(n){return new Intl.NumberFormat("ru-RU").format(Math.floor(n))}
function toast(msg){const el=$("toast");el.textContent=msg;el.classList.add("show");clearTimeout(window.__toast);window.__toast=setTimeout(()=>el.classList.remove("show"),2300)}
window.toast=toast;

function render(){
  const u=state.user;
  $("hello").textContent = u.premium ? `Привет, ${u.firstName}. PREMIUM 👑` : `Привет, ${u.firstName}. Заходим, брат.`;
  $("money").textContent=money(u.money); $("money2").textContent=money(u.money); $("hallMoney").textContent=money(u.money);
  $("energy").textContent=Math.floor(u.energy); $("energy2").textContent=Math.floor(u.energy);
  $("level").textContent=u.level; $("xp").textContent=u.xp; $("xpToNext").textContent=u.xpToNext; $("rep").textContent=u.reputation;
  $("xpbar").style.width=`${Math.max(0,Math.min(100,u.xp/u.xpToNext*100))}%`;
  $("profileName").textContent=u.firstName; $("profileName2").textContent=u.firstName; $("profileLevel").textContent=u.level; $("profileLevel2").textContent=u.level;
  $("statLevel").textContent=u.level; $("statMoney").textContent=money(u.money); $("statRep").textContent=u.reputation;

  $("tasks").innerHTML=state.tasks.map(t=>{
    const locked=u.level<t.min_level;
    const icon=["🧹","🔧","🚕","🧺","🍺","🌙","💼"][t.id-1]||"🎯";
    return `<div class="task"><div class="task-left"><div class="task-icon">${icon}</div><div><h3>${t.title}</h3><p>⚡ −${t.energy_cost} · минимум LVL ${t.min_level}</p><div class="reward">💵 +${money(t.reward_money)} · ⭐ +${t.reward_xp} XP</div></div></div><button class="primary" ${locked?"disabled":""} onclick="doTask(${t.id})">${locked?"LVL "+t.min_level:"СДЕЛАТЬ"}</button></div>`;
  }).join("");

  $("leaderboard").innerHTML=(state.leaderboard||[]).map((p,i)=>`<div class="leader"><div class="rank">${i+1}</div><div class="avatar">${p.premium?"👑":"😎"}</div><div class="meta"><b>${p.firstName}</b><small>LVL ${p.level} · репутация ${p.reputation}</small></div><div class="num">💵 ${money(p.money)}</div></div>`).join("") || `<div class="card" style="padding:13px;color:#9cb1bf;font-size:11px">Пока ты первый. Зови друзей.</div>`;
}

async function boot(){
  try{state=await api("/api/auth");render();}
  catch(e){toast(isTelegram?e.message:"Demo-режим: открой в Telegram, чтобы подключить игрока.");}
}
window.doTask=async function(id){
  try{const old=state.user.level;const d=await api("/api/action","POST",{taskId:id});state.user={...state.user,...d.user};render();toast(`+${money(d.reward.reward_money)} ₽ · +${d.reward.reward_xp} XP`);if(d.user.level>old)setTimeout(()=>toast(`🔥 НОВЫЙ УРОВЕНЬ: ${d.user.level}`),500)}catch(e){toast(e.message)}};
window.buyItem=async function(kind){try{const d=await api("/api/buy","POST",{kind});state.user=d.user;render();toast(kind==="energy50"?"⚡ Энергия +50":"😎 Репутация +5")}catch(e){toast(e.message)}};
window.buyStars=async function(kind){
  if(!isTelegram)return toast("Открой игру внутри Telegram для оплаты Stars.");
  try{const d=await api("/api/stars/invoice","POST",{kind});tg.openInvoice(d.invoice,(status)=>{if(status==="paid"){setTimeout(refresh,900);toast("✅ Покупка оплачена") }else if(status==="pending"){toast("Платёж обрабатывается")}})}catch(e){toast(e.message)}
};
async function refresh(){try{const d=await api("/api/auth");state=d;render()}catch(e){}}
$("dailyBtn").onclick=async()=>{try{const d=await api("/api/daily");state.user=d.user;render();toast(`🎁 Получено ${money(d.reward)} ₽`)}catch(e){toast(e.message)}};
$("spinBtn").onclick=async()=>{
  const reel=$("machine");reel.animate([{transform:"translateY(-5px)"},{transform:"translateY(5px)"},{transform:"translateY(0)"}],{duration:450,iterations:2});
  try{const d=await api("/api/spin");setTimeout(()=>{reel.innerHTML=d.symbols.map((x,i)=>i===1?`<span>${x}</span>`:x).join(" ");$("spinResult").textContent=`Выигрыш: ${money(d.win)} ₽`;state.user=d.user;render();toast(d.win?`✨ Выигрыш +${money(d.win)} ₽`:`Попробуй ещё раз`)},450)}catch(e){toast(e.message)}
};
function showScreen(screen){document.querySelectorAll(".view").forEach(x=>x.classList.remove("active"));$("view-"+screen).classList.add("active");document.querySelectorAll(".nav-btn").forEach(x=>x.classList.toggle("active",x.dataset.screen===screen));window.scrollTo({top:0,behavior:"smooth"});if(tg?.BackButton){if(screen==="home")tg.BackButton.hide();else{tg.BackButton.show();tg.BackButton.offClick?.();tg.BackButton.onClick(()=>showScreen("home"));}}}
window.showScreen=showScreen;
document.querySelectorAll("[data-screen]").forEach(b=>b.addEventListener("click",()=>showScreen(b.dataset.screen)));
boot();
