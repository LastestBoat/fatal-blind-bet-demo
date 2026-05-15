import React, { useEffect, useMemo, useState } from "react";
import { initializeApp } from "firebase/app";
import { getDatabase, ref, get, set, update, onValue, remove } from "firebase/database";

// 把 Firebase 控制台给你的 firebaseConfig 粘到这里。
// 重要：变量名必须叫 firebaseConfig，不要改成 FIREBASE_CONFIG。
const firebaseConfig = {
  apiKey: "AIzaSyA7rrpAnDdDxJCUIvypXGwle80r5vQym4M",
  authDomain: "bet-test-v1.firebaseapp.com",
  databaseURL: "https://bet-test-v1-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "bet-test-v1",
  storageBucket: "bet-test-v1.firebasestorage.app",
  messagingSenderId: "584623607407",
  appId: "1:584623607407:web:8abb53810734f95f52079a"
};

const firebaseReady = !String(firebaseConfig.apiKey).startsWith("YOUR_");
const app = firebaseReady ? initializeApp(firebaseConfig) : null;
const db = firebaseReady ? getDatabase(app) : null;

const ATTRS = [
  ["str", "强壮", "基础伤害"],
  ["agi", "迅捷", "出手先后"],
  ["arm", "装甲", "伤害减免"],
  ["dex", "身手", "闪避潜力"],
  ["brv", "勇猛", "破闪命中"],
  ["wis", "智慧", "情报优势"],
];

const MULTS = [2, 1.5, 1, 0.5];

const ROLES = [
  { name: "红筹赌徒", attrs: { str: 14, agi: 10, arm: 8, dex: 8, brv: 14, wis: 6 } },
  { name: "冷眼策士", attrs: { str: 7, agi: 9, arm: 8, dex: 10, brv: 8, wis: 18 } },
  { name: "疾走刺客", attrs: { str: 9, agi: 16, arm: 7, dex: 14, brv: 8, wis: 6 } },
  { name: "铁壁债客", attrs: { str: 8, agi: 7, arm: 17, dex: 7, brv: 10, wis: 11 } },
];

const clone = (x) => JSON.parse(JSON.stringify(x));
const rid = () => Math.random().toString(36).slice(2, 8).toUpperCase();
const roomPath = (roomId) => ref(db, `fatalBlindBetRooms/${roomId}`);
const emptyBet = () => Object.fromEntries(ATTRS.map(([k]) => [k, 0]));
const totalBet = (b = {}) => ATTRS.reduce((s, [k]) => s + Number(b?.[k] || 0), 0);
const totalAttr = (a = {}) => ATTRS.reduce((s, [k]) => s + Math.max(0, Number(a?.[k] || 0)), 0);
const shuffle = (a) => [...a].sort(() => Math.random() - 0.5);

function hpBand(hp) {
  if (hp <= 0) return "淘汰";
  if (hp <= 20) return "濒死";
  if (hp <= 40) return "重伤";
  if (hp <= 60) return "负伤";
  if (hp <= 80) return "轻伤";
  return "稳定";
}

function bandColor(band) {
  return {
    稳定: "#58d68d",
    轻伤: "#a3e635",
    负伤: "#facc15",
    重伤: "#fb923c",
    濒死: "#f87171",
    淘汰: "#71717a",
  }[band] || "#a1a1aa";
}

function calcMults(totals) {
  return totals.map((v) => MULTS[Math.min(totals.filter((x) => x > v).length, 3)]);
}

function formatBet(bet = {}) {
  const items = ATTRS.filter(([k]) => Number(bet?.[k] || 0) > 0).map(([k, n]) => `${n}-${bet[k]}`);
  return items.length ? items.join("、") : "未下注";
}

function runTests() {
  return [
    ["倍率 10/6/3/1", JSON.stringify(calcMults([10, 6, 3, 1])) === JSON.stringify([2, 1.5, 1, 0.5])],
    ["并列共享最高档", JSON.stringify(calcMults([6, 6, 3, 1])) === JSON.stringify([2, 2, 1, 0.5])],
    ["血量档位", hpBand(19) === "濒死" && hpBand(61) === "轻伤"],
    ["向下取整", Math.floor(3 * 1.5) === 4 && Math.floor(1 * 0.5) === 0],
  ];
}

function Pill({ children, color }) {
  return <span className="pill" style={color ? { borderColor: color, color } : undefined}>{children}</span>;
}

function StatBox({ label, value, hint, danger }) {
  return (
    <div className={danger ? "stat danger" : "stat"}>
      <div className="statLabel">{label}</div>
      <div className="statValue">{value}</div>
      {hint && <div className="statHint">{hint}</div>}
    </div>
  );
}

function PlayerCard({ p, isMe, showAll, phase }) {
  const band = hpBand(p.hp);
  const reveal = isMe || showAll;
  return (
    <section className={`playerCard ${isMe ? "me" : ""} ${!p.alive ? "dead" : ""}`}>
      <div className="playerTop">
        <div>
          <h3>{p.displayName}</h3>
          <div className="subText">座位 {p.seat + 1}｜{p.roleName}</div>
        </div>
        <Pill color={bandColor(band)}>{band}</Pill>
      </div>

      <div className="hpTrack"><div className="hpFill" style={{ width: `${Math.max(0, Math.min(100, p.hp))}%`, background: bandColor(band) }} /></div>

      <div className="miniRow">
        <Pill>总属性 {reveal ? totalAttr(p.attrs) : "?"}</Pill>
        <Pill>上轮押 {p.lastBet || 0}</Pill>
        <Pill>倍率 ×{p.lastMul || 1}</Pill>
        <Pill>金币 {p.gold || 0}</Pill>
      </div>

      <div className="attrGrid">
        {ATTRS.map(([k, n, h]) => (
          <StatBox key={k} label={n} value={reveal ? p.attrs?.[k] ?? 0 : "?"} hint={reveal ? h : "隐藏"} danger={isMe && p.attrs?.[k] <= 2} />
        ))}
      </div>

      <div className="readyRow">
        <span className={p.readyBet ? "ready on" : "ready"}>下注 {p.readyBet ? "✓" : "·"}</span>
        <span className={p.readyAttack ? "ready on" : "ready"}>攻击 {p.readyAttack ? "✓" : "·"}</span>
        {phase === "bet" && showAll && p.bet && <span className="ready peek">押注：{formatBet(p.bet)}</span>}
        {phase === "attack" && showAll && p.attackTarget && <span className="ready peek">目标已选</span>}
      </div>
    </section>
  );
}

export default function FatalBlindBetOnlineLite() {
  const [roomId, setRoomId] = useState("");
  const [inputRoom, setInputRoom] = useState("");
  const [name, setName] = useState(localStorage.getItem("fbb_name") || "测试玩家");
  const [pid, setPid] = useState(localStorage.getItem("fbb_pid") || "");
  const [room, setRoom] = useState(null);
  const [bet, setBet] = useState(emptyBet());
  const [target, setTarget] = useState("");
  const [showAll, setShowAll] = useState(true);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!firebaseReady || !roomId) return undefined;
    return onValue(roomPath(roomId), (snap) => setRoom(snap.val()));
  }, [roomId]);

  const players = useMemo(() => Object.values(room?.players || {}).sort((a, b) => a.seat - b.seat), [room]);
  const me = players.find((p) => p.id === pid);
  const alive = players.filter((p) => p.alive);
  const allBetReady = alive.length > 1 && alive.every((p) => p.readyBet);
  const allAtkReady = alive.length > 1 && alive.every((p) => p.readyAttack);
  const canBet = me && ATTRS.every(([k]) => Number(bet[k] || 0) <= Number(me.attrs?.[k] || 0)) && totalBet(bet) > 0 && !me.readyBet;

  const betPreview = useMemo(() => {
    if (!me) return [];
    return ATTRS.filter(([k]) => Number(bet[k] || 0) > 0).map(([k, n]) => ({ name: n, value: Number(bet[k] || 0), left: Number(me.attrs[k] || 0) - Number(bet[k] || 0) }));
  }, [bet, me]);

  async function createRoom() {
    if (!firebaseReady) return;
    const id = rid();
    await set(roomPath(id), { phase: "lobby", round: 1, players: {}, logs: ["房间已创建。等待玩家加入。"] });
    setInputRoom(id);
    setRoomId(id);
  }

  async function joinRoom() {
    if (!firebaseReady) return;
    const id = inputRoom.trim().toUpperCase();
    if (!id) return alert("请输入房间码");
    const snap = await get(roomPath(id));
    if (!snap.exists()) return alert("房间不存在");
    const data = snap.val();
    const ps = Object.values(data.players || {});
    let myId = localStorage.getItem(`fbb_pid_${id}`);
    const old = myId && ps.find((p) => p.id === myId);
    if (!old) {
      if (ps.length >= 4) return alert("房间已满，最多4人");
      myId = Math.random().toString(36).slice(2);
      const seat = ps.length;
      const role = ROLES[seat];
      await update(roomPath(id), {
        [`players/${myId}`]: {
          id: myId,
          seat,
          displayName: name || `玩家${seat + 1}`,
          roleName: role.name,
          hp: 100,
          attrs: clone(role.attrs),
          alive: true,
          gold: 0,
          lastBet: 0,
          lastMul: 1,
          readyBet: false,
          readyAttack: false,
        },
        logs: [`${name || `玩家${seat + 1}`} 加入房间，获得角色【${role.name}】。`, ...(data.logs || [])].slice(0, 80),
      });
      localStorage.setItem(`fbb_pid_${id}`, myId);
    }
    localStorage.setItem("fbb_name", name);
    localStorage.setItem("fbb_pid", myId);
    setPid(myId);
    setRoomId(id);
  }

  async function startGame() {
    if (!room || players.length < 2) return alert("至少2人才能测试");
    await update(roomPath(roomId), { phase: "bet", logs: ["游戏开始。进入下注阶段。", ...(room.logs || [])] });
  }

  async function submitBet() {
    if (!me || !canBet) return;
    await update(roomPath(roomId), { [`players/${pid}/bet`]: bet, [`players/${pid}/readyBet`]: true });
  }

  async function cancelBet() {
    if (!me) return;
    await update(roomPath(roomId), { [`players/${pid}/bet`]: null, [`players/${pid}/readyBet`]: false });
  }

  async function resolveBet() {
    const snap = await get(roomPath(roomId));
    const data = snap.val();
    if (!data || data.phase !== "bet") return;
    const ps = Object.values(data.players || {}).sort((a, b) => a.seat - b.seat).filter((p) => p.alive);
    if (!ps.every((p) => p.readyBet)) return alert("还有人没下注");

    const totals = ps.map((p) => totalBet(p.bet));
    const ms = calcMults(totals);
    const attrCards = ps.map((p) => ({
      from: p.displayName,
      entries: ATTRS.filter(([k]) => Number(p.bet?.[k] || 0) > 0).map(([k, n]) => ({ k, n, v: Number(p.bet[k]) })),
    }));
    const pool = shuffle(attrCards);
    const updates = { phase: "attack" };
    const logs = [`第${data.round}回合｜下注结算`];

    ps.forEach((p, i) => {
      const attrs = clone(p.attrs);
      ATTRS.forEach(([k]) => { attrs[k] = Math.max(0, attrs[k] - Number(p.bet?.[k] || 0)); });
      const card = pool[i];
      const gains = [];
      card.entries.forEach((e) => {
        const gain = Math.floor(e.v * ms[i]);
        attrs[e.k] += gain;
        gains.push(`${e.n}+${gain}`);
      });
      updates[`players/${p.id}/attrs`] = attrs;
      updates[`players/${p.id}/lastBet`] = totals[i];
      updates[`players/${p.id}/lastMul`] = ms[i];
      updates[`players/${p.id}/readyBet`] = false;
      updates[`players/${p.id}/bet`] = null;
      logs.push(`${p.displayName} 支付 ${totals[i]} 点［${formatBet(p.bet)}］，获得倍率 ×${ms[i]}，抽到 ${card.from} 的属性卡：${gains.join("、") || "空卡"}`);
    });

    const top = Math.max(...totals);
    const avg = totals.reduce((a, b) => a + b, 0) / totals.length;
    logs.push(`本轮最高下注：${top} 点；平均下注：${avg.toFixed(1)} 点。`);
    updates.logs = [...logs, ...(data.logs || [])].slice(0, 100);
    await update(roomPath(roomId), updates);
  }

  async function submitAttack() {
    if (!me || !target) return;
    await update(roomPath(roomId), { [`players/${pid}/attackTarget`]: target, [`players/${pid}/readyAttack`]: true });
  }

  async function cancelAttack() {
    if (!me) return;
    await update(roomPath(roomId), { [`players/${pid}/attackTarget`]: null, [`players/${pid}/readyAttack`]: false });
  }

  async function resolveAttack() {
    const snap = await get(roomPath(roomId));
    const data = snap.val();
    if (!data || data.phase !== "attack") return;
    const all = Object.values(data.players || {}).sort((a, b) => a.seat - b.seat);
    const ps = all.filter((p) => p.alive);
    if (!ps.every((p) => p.readyAttack)) return alert("还有人没选攻击目标");

    const damageMap = {};
    const goldMap = {};
    const logs = [`第${data.round}回合｜攻击结算`];

    ps.forEach((p) => {
      const t = all.find((x) => x.id === p.attackTarget && x.alive);
      if (!t) return logs.push(`${p.displayName} 的目标无效，攻击落空。`);
      const dmg = Math.max(1, Math.floor(Number(p.attrs.str || 0) - Number(t.attrs.arm || 0) * 0.5));
      damageMap[t.id] = (damageMap[t.id] || 0) + dmg;
      goldMap[p.id] = (goldMap[p.id] || 0) + dmg;
      logs.push(`${p.displayName} 攻击 ${t.displayName}：强壮 ${p.attrs.str} vs 装甲 ${t.attrs.arm}，造成 ${dmg} 点伤害。`);
    });

    const updates = { phase: "bet", round: Number(data.round || 1) + 1 };
    all.forEach((p) => {
      const dmg = damageMap[p.id] || 0;
      const hp = Math.max(0, Number(p.hp || 0) - dmg);
      updates[`players/${p.id}/hp`] = hp;
      updates[`players/${p.id}/alive`] = hp > 0;
      updates[`players/${p.id}/gold`] = Number(p.gold || 0) + (goldMap[p.id] || 0);
      updates[`players/${p.id}/readyAttack`] = false;
      updates[`players/${p.id}/attackTarget`] = null;
      if (dmg > 0) logs.push(`${p.displayName} 承受总伤害 ${dmg}，血量档位变为【${hpBand(hp)}】。`);
      if (hp <= 0 && p.alive) logs.push(`${p.displayName} 被淘汰。`);
    });

    const survivors = all.filter((p) => (updates[`players/${p.id}/hp`] ?? p.hp) > 0);
    if (survivors.length <= 1) {
      updates.phase = "end";
      logs.push(`游戏结束：${survivors[0]?.displayName || "无人"} 获胜。`);
    }
    updates.logs = [...logs, ...(data.logs || [])].slice(0, 100);
    await update(roomPath(roomId), updates);
  }

  async function resetRoom() {
    if (roomId && confirm("确定清空这个房间？")) await remove(roomPath(roomId));
    setRoom(null);
    setRoomId("");
    setPid("");
  }

  async function copyRoom() {
    await navigator.clipboard.writeText(roomId);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  }

  const phaseName = room?.phase === "lobby" ? "大厅" : room?.phase === "bet" ? "下注阶段" : room?.phase === "attack" ? "攻击阶段" : room?.phase === "end" ? "结束" : "未进入房间";

  return (
    <div className="page">
      <style>{`
        * { box-sizing: border-box; }
        body { margin: 0; background: #07070a; }
        .page { min-height: 100vh; padding: 24px; color: #f4f4f5; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: radial-gradient(circle at top left, rgba(127,29,29,.4), transparent 32%), linear-gradient(135deg, #08080b, #111113 45%, #050505); }
        .wrap { max-width: 1280px; margin: 0 auto; display: grid; gap: 18px; }
        .hero, .panel, .playerCard { border: 1px solid rgba(255,255,255,.11); background: rgba(24,24,27,.88); border-radius: 26px; box-shadow: 0 18px 50px rgba(0,0,0,.35); }
        .hero { padding: 24px; display: flex; justify-content: space-between; gap: 18px; align-items: flex-end; background: linear-gradient(135deg, rgba(127,29,29,.35), rgba(24,24,27,.92)); }
        .eyebrow { color: #fca5a5; letter-spacing: .28em; font-size: 12px; font-weight: 800; }
        h1, h2, h3 { margin: 0; }
        h1 { font-size: clamp(30px, 5vw, 54px); letter-spacing: -.04em; }
        h2 { font-size: 24px; margin-bottom: 8px; }
        h3 { font-size: 18px; }
        .subText { color: #a1a1aa; font-size: 13px; }
        .row { display: flex; gap: 10px; flex-wrap: wrap; align-items: center; }
        .grid4 { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 14px; }
        .grid2 { display: grid; grid-template-columns: 1.3fr .7fr; gap: 16px; }
        .panel { padding: 20px; }
        .playerCard { padding: 16px; }
        .playerCard.me { border-color: rgba(248,113,113,.7); background: linear-gradient(180deg, rgba(127,29,29,.25), rgba(24,24,27,.92)); }
        .playerCard.dead { opacity: .45; filter: grayscale(1); }
        .playerTop { display: flex; justify-content: space-between; gap: 10px; align-items: flex-start; }
        .pill { display: inline-flex; align-items: center; gap: 5px; border: 1px solid rgba(255,255,255,.15); background: rgba(0,0,0,.25); padding: 5px 9px; border-radius: 999px; color: #d4d4d8; font-size: 12px; font-weight: 800; }
        .hpTrack { height: 9px; background: #27272a; border-radius: 999px; overflow: hidden; margin-top: 12px; }
        .hpFill { height: 100%; border-radius: 999px; transition: width .25s ease; }
        .miniRow, .readyRow { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 10px; }
        .attrGrid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px; margin-top: 12px; }
        .stat { background: rgba(0,0,0,.28); border: 1px solid rgba(255,255,255,.07); border-radius: 16px; padding: 10px; min-height: 74px; }
        .stat.danger { border-color: rgba(248,113,113,.55); background: rgba(127,29,29,.18); }
        .statLabel { color: #a1a1aa; font-size: 12px; }
        .statValue { margin-top: 2px; font-size: 26px; font-weight: 950; color: #fff; }
        .statHint { color: #71717a; font-size: 11px; margin-top: 2px; }
        .ready { border-radius: 999px; background: rgba(63,63,70,.55); color: #a1a1aa; padding: 4px 8px; font-size: 12px; }
        .ready.on { background: rgba(22,101,52,.35); color: #86efac; }
        .ready.peek { background: rgba(124,45,18,.35); color: #fdba74; }
        input, button, select { font: inherit; }
        .input { width: 100%; border: 1px solid rgba(255,255,255,.1); background: rgba(0,0,0,.34); color: #fff; border-radius: 14px; padding: 12px 14px; outline: none; }
        .btn { border: 0; background: #fecaca; color: #18181b; font-weight: 950; border-radius: 14px; padding: 12px 16px; cursor: pointer; box-shadow: 0 8px 22px rgba(127,29,29,.25); }
        .btn.secondary { background: rgba(255,255,255,.08); color: #f4f4f5; border: 1px solid rgba(255,255,255,.12); box-shadow: none; }
        .btn:disabled { cursor: not-allowed; background: #3f3f46; color: #71717a; box-shadow: none; }
        .betGrid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
        .betBox { border: 1px solid rgba(255,255,255,.09); background: rgba(0,0,0,.25); border-radius: 18px; padding: 14px; }
        .betLine { display: flex; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
        input[type=range] { width: 100%; accent-color: #f87171; }
        .targetGrid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 10px; }
        .target { display: block; border: 1px solid rgba(255,255,255,.1); background: rgba(0,0,0,.25); border-radius: 16px; padding: 12px; cursor: pointer; }
        .target.selected { border-color: #fca5a5; background: rgba(127,29,29,.28); }
        .logBox { max-height: 520px; overflow: auto; display: grid; gap: 8px; padding-right: 4px; }
        .log { background: rgba(0,0,0,.28); border: 1px solid rgba(255,255,255,.07); border-radius: 14px; padding: 10px 12px; color: #d4d4d8; font-size: 14px; line-height: 1.45; }
        .testOk { color: #86efac; }
        .testBad { color: #fca5a5; }
        .bigNumber { font-size: 42px; line-height: 1; font-weight: 950; color: #fecaca; }
        .muted { color: #a1a1aa; }
        @media (max-width: 980px) { .grid4, .grid2, .targetGrid { grid-template-columns: 1fr; } .hero { align-items: flex-start; flex-direction: column; } .betGrid { grid-template-columns: 1fr; } }
      `}</style>

      <div className="wrap">
        <header className="hero">
          <div>
            <div className="eyebrow">FATAL BLIND BET ONLINE LITE</div>
            <h1>致命盲注｜下注攻击测试</h1>
            <p className="subText">只测试下注意愿、收益倍率、抽属性卡与普通攻击结算。此版不含功能牌。</p>
          </div>
          <div className="row">
            <Pill>阶段：{phaseName}</Pill>
            {room && <Pill>第 {room.round} 回合</Pill>}
            {roomId && <button className="btn secondary" onClick={copyRoom}>{copied ? "已复制" : `房间 ${roomId}`}</button>}
            <button className="btn secondary" onClick={() => setShowAll(!showAll)}>{showAll ? "关闭测试透视" : "开启测试透视"}</button>
            {roomId && <button className="btn" onClick={resetRoom}>清空房间</button>}
          </div>
        </header>

        {!firebaseReady && (
          <section className="panel">
            <h2>需要填写 Firebase 配置</h2>
            <p className="muted">把 Firebase 控制台里的 firebaseConfig 粘到代码顶部。变量名必须叫 firebaseConfig。</p>
          </section>
        )}

        {!roomId && firebaseReady && (
          <section className="panel">
            <h2>创建 / 加入房间</h2>
            <div className="grid2">
              <div className="row">
                <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="你的昵称" />
                <input className="input" value={inputRoom} onChange={(e) => setInputRoom(e.target.value.toUpperCase())} placeholder="房间码" />
              </div>
              <div className="row">
                <button className="btn" onClick={createRoom}>创建房间</button>
                <button className="btn secondary" onClick={joinRoom}>加入房间</button>
              </div>
            </div>
          </section>
        )}

        {room && (
          <>
            <section className="panel">
              <div className="row" style={{ justifyContent: "space-between" }}>
                <div>
                  <h2>房间控制台</h2>
                  <div className="subText">房间码 <b style={{ color: "#fecaca" }}>{roomId}</b>｜人数 {players.length}/4｜当前玩家：{me?.displayName || "未加入"}</div>
                </div>
                <div className="row">
                  {room.phase === "lobby" && <button className="btn" onClick={startGame} disabled={players.length < 2}>开始测试</button>}
                  {room.phase === "bet" && <button className="btn" onClick={resolveBet} disabled={!allBetReady}>结算下注 {allBetReady ? "" : "｜等待中"}</button>}
                  {room.phase === "attack" && <button className="btn" onClick={resolveAttack} disabled={!allAtkReady}>结算攻击 {allAtkReady ? "" : "｜等待中"}</button>}
                </div>
              </div>
            </section>

            <section className="grid4">
              {players.map((p) => <PlayerCard key={p.id} p={p} isMe={p.id === pid} showAll={showAll} phase={room.phase} />)}
            </section>

            <main className="grid2">
              <section className="panel">
                {me && room.phase === "bet" && (
                  <div>
                    <h2>下注阶段</h2>
                    <p className="muted">你支付的属性会先扣掉。系统按总支付量排名给倍率，然后随机抽一张属性卡，按你的倍率结算。</p>
                    <div className="row" style={{ marginTop: 14, alignItems: "stretch" }}>
                      <div className="stat" style={{ minWidth: 150 }}><div className="statLabel">当前总支付</div><div className="bigNumber">{totalBet(bet)}</div></div>
                      <div className="stat" style={{ flex: 1 }}><div className="statLabel">支付预览</div><div style={{ marginTop: 8 }}>{betPreview.length ? betPreview.map((b) => <Pill key={b.name}>{b.name}-{b.value}｜剩{b.left}</Pill>) : <span className="muted">尚未下注</span>}</div></div>
                    </div>
                    <div className="betGrid" style={{ marginTop: 14 }}>
                      {ATTRS.map(([k, n, h]) => (
                        <div className="betBox" key={k}>
                          <div className="betLine"><b>{n}</b><span className="muted">当前 {me.attrs[k]}｜支付 {bet[k]}</span></div>
                          <input type="range" min="0" max={me.attrs[k]} value={bet[k]} onChange={(e) => setBet({ ...bet, [k]: Number(e.target.value) })} />
                          <div className="subText">{h}</div>
                        </div>
                      ))}
                    </div>
                    <div className="row" style={{ marginTop: 16 }}>
                      <button className="btn" disabled={!canBet} onClick={submitBet}>提交下注</button>
                      <button className="btn secondary" disabled={!me.readyBet} onClick={cancelBet}>撤回重下</button>
                    </div>
                  </div>
                )}

                {me && room.phase === "attack" && (
                  <div>
                    <h2>攻击阶段</h2>
                    <p className="muted">测试版只结算普通攻击：伤害 = floor(攻击者强壮 - 目标装甲×0.5)，最低 1 点。</p>
                    <div className="targetGrid" style={{ marginTop: 14 }}>
                      {players.filter((p) => p.alive && p.id !== pid).map((p) => (
                        <label key={p.id} className={target === p.id ? "target selected" : "target"}>
                          <input type="radio" checked={target === p.id} onChange={() => setTarget(p.id)} />
                          <b style={{ marginLeft: 8 }}>{p.displayName}</b>
                          <div className="subText">血量：{hpBand(p.hp)}｜角色：{p.roleName}</div>
                        </label>
                      ))}
                    </div>
                    <div className="row" style={{ marginTop: 16 }}>
                      <button className="btn" disabled={!target || me.readyAttack} onClick={submitAttack}>提交攻击目标</button>
                      <button className="btn secondary" disabled={!me.readyAttack} onClick={cancelAttack}>撤回重选</button>
                    </div>
                  </div>
                )}

                {room.phase === "lobby" && (
                  <div>
                    <h2>等待玩家加入</h2>
                    <p className="muted">把页面链接和房间码发给测试者。人齐后点击“开始测试”。</p>
                  </div>
                )}

                {room.phase === "end" && (
                  <div>
                    <h2>游戏结束</h2>
                    <p>胜者：<b>{players.find((p) => p.alive)?.displayName || "无人"}</b></p>
                  </div>
                )}
              </section>

              <aside className="panel">
                <h2>战报</h2>
                <div className="logBox">
                  {(room.logs || []).map((l, i) => <div key={i} className="log">{l}</div>)}
                </div>
                <h2 style={{ marginTop: 18 }}>规则自检</h2>
                {runTests().map(([n, ok]) => <div key={n} className={ok ? "testOk" : "testBad"}>{ok ? "✓" : "×"} {n}</div>)}
              </aside>
            </main>
          </>
        )}
      </div>
    </div>
  );
}
