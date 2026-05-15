import React, { useEffect, useMemo, useState } from "react";
import { initializeApp } from "firebase/app";
import { getDatabase, ref, get, set, update, onValue, remove } from "firebase/database";

// 1) 在 Firebase 控制台创建 Web App + Realtime Database。
// 2) 把配置粘到这里。
// 3) 发布到 Vercel / Netlify 后，4 个测试者用同一个房间码进入。
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
  ["str", "强壮"],
  ["agi", "迅捷"],
  ["arm", "装甲"],
  ["dex", "身手"],
  ["brv", "勇猛"],
  ["wis", "智慧"],
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
const emptyBet = () => Object.fromEntries(ATTRS.map(([k]) => [k, 0]));
const totalBet = (b = {}) => ATTRS.reduce((s, [k]) => s + Number(b[k] || 0), 0);
const totalAttr = (a = {}) => ATTRS.reduce((s, [k]) => s + Math.max(0, Number(a[k] || 0)), 0);
const hpBand = (hp) => (hp <= 0 ? "淘汰" : hp <= 20 ? "濒死" : hp <= 40 ? "重伤" : hp <= 60 ? "负伤" : hp <= 80 ? "轻伤" : "稳定");
const shuffle = (a) => [...a].sort(() => Math.random() - 0.5);
const calcMults = (totals) => totals.map((v) => MULTS[Math.min(totals.filter((x) => x > v).length, 3)]);
const path = (roomId) => ref(db, `fatalBlindBetRooms/${roomId}`);

function tests() {
  return [
    ["倍率 10/6/3/1", JSON.stringify(calcMults([10, 6, 3, 1])) === JSON.stringify([2, 1.5, 1, 0.5])],
    ["并列共享最高档", JSON.stringify(calcMults([6, 6, 3, 1])) === JSON.stringify([2, 2, 1, 0.5])],
    ["血量档位", hpBand(19) === "濒死" && hpBand(61) === "轻伤"],
    ["向下取整", Math.floor(3 * 1.5) === 4 && Math.floor(1 * 0.5) === 0],
  ];
}

function PlayerCard({ p, me, showAll }) {
  return (
    <div className={`rounded-2xl border p-3 ${me ? "border-red-400 bg-red-950/20" : "border-zinc-800 bg-zinc-900"} ${!p.alive ? "opacity-40" : ""}`}>
      <div className="flex justify-between gap-2">
        <b>{p.displayName}</b>
        <span className="rounded-full border border-zinc-700 px-2 py-1 text-xs">{hpBand(p.hp)}</span>
      </div>
      <div className="mt-2 text-xs text-zinc-400">{p.roleName}｜总属性 {me || showAll ? totalAttr(p.attrs) : "?"}</div>
      <div className="mt-2 h-2 rounded bg-zinc-800"><div className="h-2 rounded bg-red-300" style={{ width: `${Math.max(0, p.hp)}%` }} /></div>
      <div className="mt-3 grid grid-cols-3 gap-2 text-xs">
        {ATTRS.map(([k, n]) => (
          <div key={k} className="rounded-xl bg-black/30 p-2">
            <div className="text-zinc-500">{n}</div>
            <div className="text-lg font-black">{me || showAll ? p.attrs[k] : "?"}</div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-1 text-xs text-zinc-300">
        <span className="rounded-full bg-zinc-800 px-2 py-1">上轮押 {p.lastBet || 0}</span>
        <span className="rounded-full bg-zinc-800 px-2 py-1">倍率 ×{p.lastMul || 1}</span>
        <span className="rounded-full bg-zinc-800 px-2 py-1">金币 {p.gold || 0}</span>
        {p.readyBet && <span className="rounded-full bg-red-500/20 px-2 py-1 text-red-200">已下注</span>}
        {p.readyAttack && <span className="rounded-full bg-orange-500/20 px-2 py-1 text-orange-200">已选目标</span>}
      </div>
    </div>
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
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (!firebaseReady || !roomId) return undefined;
    return onValue(path(roomId), (snap) => setRoom(snap.val()));
  }, [roomId]);

  const players = useMemo(() => Object.values(room?.players || {}).sort((a, b) => a.seat - b.seat), [room]);
  const me = players.find((p) => p.id === pid);
  const alive = players.filter((p) => p.alive);
  const allBetReady = alive.length > 1 && alive.every((p) => p.readyBet);
  const allAtkReady = alive.length > 1 && alive.every((p) => p.readyAttack);
  const canBet = me && ATTRS.every(([k]) => Number(bet[k] || 0) <= me.attrs[k]) && totalBet(bet) > 0;

  async function createRoom() {
    if (!firebaseReady) return;
    const id = rid();
    await set(path(id), { phase: "lobby", round: 1, players: {}, logs: ["房间已创建。等待玩家加入。"] });
    setInputRoom(id);
    setRoomId(id);
  }

  async function joinRoom() {
    if (!firebaseReady) return;
    const id = inputRoom.trim().toUpperCase();
    if (!id) return;
    const snap = await get(path(id));
    if (!snap.exists()) return alert("房间不存在");
    const data = snap.val();
    const ps = Object.values(data.players || {});
    let myId = localStorage.getItem(`fbb_pid_${id}`);
    let existing = myId && ps.find((p) => p.id === myId);
    if (!existing) {
      if (ps.length >= 4) return alert("房间已满，最多4人");
      myId = Math.random().toString(36).slice(2);
      const seat = ps.length;
      const role = ROLES[seat];
      await update(path(id), {
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
    await update(path(roomId), { phase: "bet", logs: ["游戏开始：进入下注阶段。", ...(room.logs || [])] });
  }

  async function submitBet() {
    if (!me || !canBet) return;
    await update(path(roomId), {
      [`players/${pid}/bet`]: bet,
      [`players/${pid}/readyBet`]: true,
    });
  }

  async function resolveBet() {
    const snap = await get(path(roomId));
    const data = snap.val();
    if (!data || data.phase !== "bet") return;
    const ps = Object.values(data.players || {}).sort((a, b) => a.seat - b.seat).filter((p) => p.alive);
    if (!ps.every((p) => p.readyBet)) return alert("还有人没下注");

    const totals = ps.map((p) => totalBet(p.bet));
    const ms = calcMults(totals);
    const attrCards = ps.map((p) => ({ from: p.displayName, entries: ATTRS.filter(([k]) => Number(p.bet?.[k] || 0) > 0).map(([k, n]) => ({ k, n, v: Number(p.bet[k]) })) }));
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
      logs.push(`${p.displayName} 支付${totals[i]}点，倍率×${ms[i]}，抽到${card.from}的属性卡：${gains.join("、") || "空卡"}`);
    });
    updates.logs = [...logs, ...(data.logs || [])].slice(0, 80);
    await update(path(roomId), updates);
  }

  async function submitAttack() {
    if (!me || !target) return;
    await update(path(roomId), {
      [`players/${pid}/attackTarget`]: target,
      [`players/${pid}/readyAttack`]: true,
    });
  }

  async function resolveAttack() {
    const snap = await get(path(roomId));
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
      logs.push(`${p.displayName} 攻击 ${t.displayName}，预计造成 ${dmg} 点伤害。`);
    });

    const updates = { phase: "bet", round: Number(data.round || 1) + 1 };
    all.forEach((p) => {
      const dmg = damageMap[p.id] || 0;
      const hp = Math.max(0, Number(p.hp || 0) - dmg);
      updates[`players/${p.id}/hp`] = hp;
      updates[`players/${p.id}/alive`] = hp > 0;
      updates[`players/${p.id}/gold`] = Number(p.gold || 0) + (goldMap[p.id] || 0) + (hp <= 0 && damageMap[p.id] ? 20 : 0);
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
    updates.logs = [...logs, ...(data.logs || [])].slice(0, 80);
    await update(path(roomId), updates);
  }

  async function resetRoom() {
    if (roomId && confirm("确定清空这个房间？")) await remove(path(roomId));
    setRoom(null); setRoomId(""); setPid("");
  }

  if (!firebaseReady) {
    return (
      <div className="min-h-screen bg-zinc-950 p-6 text-zinc-100">
        <div className="mx-auto max-w-3xl rounded-3xl border border-red-500/30 bg-zinc-900 p-6">
          <h1 className="text-3xl font-black">致命盲注｜在线下注测试Demo</h1>
          <p className="mt-3 text-zinc-300">需要先填写 Firebase 配置才能多人在线同步。现在代码结构已准备好，只差数据库钥匙。</p>
          <ol className="mt-4 list-decimal space-y-2 pl-5 text-sm text-zinc-400">
            <li>去 Firebase 创建项目，启用 Realtime Database。</li>
            <li>创建 Web App，复制 firebaseConfig。</li>
            <li>替换代码顶部的 FIREBASE_CONFIG。</li>
            <li>部署到 Vercel / Netlify，分享链接和房间码给 4 个测试者。</li>
          </ol>
          <div className="mt-5 rounded-2xl bg-black/30 p-4 text-sm">
            <b>规则自检：</b>{tests().map(([n, ok]) => <div key={n} className={ok ? "text-emerald-300" : "text-red-300"}>{ok ? "✓" : "×"} {n}</div>)}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 p-4 text-zinc-100">
      <div className="mx-auto max-w-6xl space-y-4">
        <header className="rounded-3xl border border-red-500/30 bg-zinc-900 p-5">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <div className="text-xs tracking-[0.3em] text-red-300">FATAL BLIND BET ONLINE LITE</div>
              <h1 className="text-4xl font-black">致命盲注｜下注攻击测试</h1>
              <p className="mt-1 text-sm text-zinc-400">只测试：房间、下注意愿、倍率收益、抽属性卡、攻击结算。</p>
            </div>
            <div className="flex gap-2">
              <button onClick={() => setShowAll(!showAll)} className="rounded-xl border border-zinc-700 px-3 py-2">{showAll ? "关闭透视" : "观察员透视"}</button>
              {roomId && <button onClick={resetRoom} className="rounded-xl bg-zinc-100 px-3 py-2 font-bold text-zinc-950">清空房间</button>}
            </div>
          </div>
        </header>

        {!roomId && <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5">
          <h2 className="text-2xl font-black">创建 / 加入房间</h2>
          <div className="mt-4 grid gap-3 md:grid-cols-3">
            <input className="rounded-xl bg-zinc-950 p-3" value={name} onChange={(e) => setName(e.target.value)} placeholder="你的昵称" />
            <input className="rounded-xl bg-zinc-950 p-3 uppercase" value={inputRoom} onChange={(e) => setInputRoom(e.target.value.toUpperCase())} placeholder="房间码" />
            <div className="flex gap-2"><button onClick={createRoom} className="flex-1 rounded-xl bg-red-200 p-3 font-black text-zinc-950">创建</button><button onClick={joinRoom} className="flex-1 rounded-xl border border-zinc-700 p-3 font-black">加入</button></div>
          </div>
        </section>}

        {room && <>
          <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div><b>房间码：</b><span className="text-2xl font-black text-red-200">{roomId}</span> <span className="text-zinc-500">｜阶段：{room.phase}｜第{room.round}回合</span></div>
              {room.phase === "lobby" && <button onClick={startGame} className="rounded-xl bg-red-200 px-4 py-2 font-black text-zinc-950">开始测试</button>}
              {room.phase === "bet" && allBetReady && <button onClick={resolveBet} className="rounded-xl bg-red-200 px-4 py-2 font-black text-zinc-950">结算下注</button>}
              {room.phase === "attack" && allAtkReady && <button onClick={resolveAttack} className="rounded-xl bg-red-200 px-4 py-2 font-black text-zinc-950">结算攻击</button>}
            </div>
          </section>

          <section className="grid gap-3 md:grid-cols-4">{players.map((p) => <PlayerCard key={p.id} p={p} me={p.id === pid} showAll={showAll} />)}</section>

          {me && room.phase === "bet" && <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5">
            <h2 className="text-2xl font-black">下注阶段</h2>
            <p className="text-sm text-zinc-400">你支付的属性会扣除；根据总支付排名获得收益倍率；抽到任意人的属性卡后按你的倍率结算。</p>
            <div className="mt-4 grid gap-3 md:grid-cols-2">{ATTRS.map(([k, n]) => <div key={k} className="rounded-2xl bg-black/30 p-3"><div className="flex justify-between"><b>{n}</b><span>当前{me.attrs[k]}｜押{bet[k]}</span></div><input className="mt-3 w-full accent-red-400" type="range" min="0" max={me.attrs[k]} value={bet[k]} onChange={(e) => setBet({ ...bet, [k]: Number(e.target.value) })} /></div>)}</div>
            <button disabled={!canBet || me.readyBet} onClick={submitBet} className="mt-4 w-full rounded-2xl bg-red-200 p-4 font-black text-zinc-950 disabled:bg-zinc-700 disabled:text-zinc-500">提交下注｜总支付 {totalBet(bet)}</button>
          </section>}

          {me && room.phase === "attack" && <section className="rounded-3xl border border-zinc-800 bg-zinc-900 p-5">
            <h2 className="text-2xl font-black">攻击阶段</h2>
            <p className="text-sm text-zinc-400">本测试版只做普通攻击：伤害 = floor(攻击者强壮 - 目标装甲×0.5)，最低1点。</p>
            <div className="mt-4 grid gap-2 md:grid-cols-3">{players.filter((p) => p.alive && p.id !== pid).map((p) => <label key={p.id} className="rounded-xl border border-zinc-800 bg-black/30 p-3"><input type="radio" checked={target === p.id} onChange={() => setTarget(p.id)} /> <span className="ml-2">攻击 {p.displayName}</span></label>)}</div>
            <button disabled={!target || me.readyAttack} onClick={submitAttack} className="mt-4 w-full rounded-2xl bg-red-200 p-4 font-black text-zinc-950 disabled:bg-zinc-700 disabled:text-zinc-500">提交攻击目标</button>
          </section>}

          {room.phase === "end" && <section className="rounded-3xl border border-red-500/30 bg-red-950/20 p-5"><h2 className="text-3xl font-black">游戏结束</h2><p className="mt-2">胜者：{players.find((p) => p.alive)?.displayName || "无人"}</p></section>}

          <section className="grid gap-4 lg:grid-cols-3">
            <aside className="lg:col-span-2 rounded-3xl border border-zinc-800 bg-zinc-900 p-4"><h2 className="text-xl font-black">战报</h2><div className="mt-3 max-h-80 space-y-2 overflow-auto text-sm">{(room.logs || []).map((l, i) => <div key={i} className="rounded-xl bg-black/30 p-2 text-zinc-300">{l}</div>)}</div></aside>
            <aside className="rounded-3xl border border-zinc-800 bg-zinc-900 p-4"><h2 className="text-xl font-black">规则自检</h2><div className="mt-3 space-y-1 text-sm">{tests().map(([n, ok]) => <div key={n} className={ok ? "text-emerald-300" : "text-red-300"}>{ok ? "✓" : "×"} {n}</div>)}</div></aside>
          </section>
        </>}
      </div>
    </div>
  );
}
