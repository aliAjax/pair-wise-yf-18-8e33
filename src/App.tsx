import { useMemo, useState } from "react";
import "./styles.css";
import { useCabinet } from "./business/useCabinet";
import {
  HIGH_VALUE_THRESHOLD,
  MAX_UNRETURNED_HIGH_VALUE,
  isHighValue,
  validateCloseOrder,
} from "./business/rules";

const statusText: Record<string, string> = {
  "in-cabinet": "在柜",
  "checked-out": "已领待镶",
  "pending-review": "待复核",
  set: "已镶",
};

function App() {
  const { state, derived, actions } = useCabinet();

  // 领用表单
  const [craftsmanId, setCraftsmanId] = useState(state.craftsmen[0]?.id ?? "");
  const [gemId, setGemId] = useState("");
  const [confirmerIds, setConfirmerIds] = useState<string[]>([]);

  // 归还表单
  const [returnGemId, setReturnGemId] = useState("");
  const [actualCarat, setActualCarat] = useState("");
  const [seatDamaged, setSeatDamaged] = useState(false);

  const inCabinetGems = useMemo(
    () => state.gems.filter((g) => g.status === "in-cabinet"),
    [state.gems]
  );
  const checkedOutGems = useMemo(
    () => state.gems.filter((g) => g.status === "checked-out"),
    [state.gems]
  );
  const onDutyStaff = state.staff.filter((s) => s.onDuty);
  const selectedGem = state.gems.find((g) => g.id === gemId);
  const returnGem = state.gems.find((g) => g.id === returnGemId);

  const toggleConfirmer = (id: string) =>
    setConfirmerIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]
    );

  const submitCheckout = () => {
    if (!gemId) return;
    actions.checkout(gemId, craftsmanId, confirmerIds);
    setGemId("");
    setConfirmerIds([]);
  };

  const submitReturn = () => {
    const carat = Number(actualCarat);
    if (!returnGemId || Number.isNaN(carat)) return;
    actions.returnGem(returnGemId, carat, seatDamaged);
    setReturnGemId("");
    setActualCarat("");
    setSeatDamaged(false);
  };

  return (
    <main className="app">
      <section className="hero">
        <p>hxyfront-62006 · 珠宝镶嵌 · 宝石领用柜</p>
        <h1>宝石领用柜</h1>
        <span>
          主石领用：高价值宝石（估值 ≥ {HIGH_VALUE_THRESHOLD.toLocaleString()} 元）须两名当班人员确认，
          未还高价值宝石达 {MAX_UNRETURNED_HIGH_VALUE} 颗不得再领；普通宝石一名当班人员确认。
          保险凭证过期的柜体自动锁定，补齐凭证后方可领用；归还出现称重差异或镶口伤痕即转待复核，
          关联订单暂缓结项。柜位、持有数、待镶数实时存档，重开页面自动恢复。
        </span>
      </section>

      <section className="metrics">
        <article>
          <small>在柜宝石</small>
          <strong>{derived.inCabinetCount}</strong>
        </article>
        <article>
          <small>已领待镶</small>
          <strong>{derived.pendingSetting}</strong>
        </article>
        <article>
          <small>待复核</small>
          <strong>{derived.pendingReview.length}</strong>
        </article>
        <article>
          <small>高价值未还</small>
          <strong>{derived.unreturnedHighValue}</strong>
        </article>
      </section>

      {state.notice && <div className="notice">{state.notice}</div>}

      {state.cabinets
        .filter((c) => derived.lockedCabinetIds.includes(c.id))
        .map((c) => (
          <div className="banner" key={c.id}>
            <div>
              <b>🔒 {c.name}已锁定</b>
              <p>
                保险凭证 {c.insurance?.certNo ?? "缺失"} 已于{" "}
                {c.insurance?.expiresAt ?? "—"} 过期，补齐凭证前该柜宝石不能领用。
              </p>
            </div>
            <button className="primary" onClick={() => actions.renewInsurance(c.id)}>
              补齐保险凭证
            </button>
          </div>
        ))}

      <section className="workspace">
        <aside className="panel">
          <h2>当班人员</h2>
          <div className="chips">
            {state.staff.map((s) => (
              <button
                key={s.id}
                className={s.onDuty ? "chip-on" : "chip-off"}
                title={s.onDuty ? "当班，可作为确认人" : "休班，不能确认"}
              >
                {s.name} · {s.onDuty ? "当班" : "休班"}
              </button>
            ))}
          </div>

          <h2 style={{ marginTop: 22 }}>师傅持有（待镶）</h2>
          <div className="holders">
            {state.craftsmen.map((c) => {
              const held = derived.holdings.get(c.id) ?? [];
              const high = derived.highValueHeldBy(c.id);
              const limited = high >= MAX_UNRETURNED_HIGH_VALUE;
              return (
                <article key={c.id} className="holder">
                  <div className="holder-head">
                    <b>{c.name}</b>
                    <span>
                      持有 {held.length} 颗 · 高价值未还 {high}/{MAX_UNRETURNED_HIGH_VALUE}
                      {limited && <em className="badge badge-danger">限领</em>}
                    </span>
                  </div>
                  {held.length === 0 ? (
                    <p className="muted">无持有宝石</p>
                  ) : (
                    <ul>
                      {held.map((g) => (
                        <li key={g.id}>
                          {g.id} {g.kind} {g.carat.toFixed(2)}ct
                          {isHighValue(g) && <em className="badge badge-high">高价值</em>}
                        </li>
                      ))}
                    </ul>
                  )}
                </article>
              );
            })}
          </div>
        </aside>

        <section className="panel form-panel">
          <div className="heading">
            <div>
              <p>领用办理</p>
              <h2>师傅领石</h2>
            </div>
          </div>
          <div className="field-grid">
            <label>
              <span>领用师傅</span>
              <select value={craftsmanId} onChange={(e) => setCraftsmanId(e.target.value)}>
                {state.craftsmen.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}（高价值未还 {derived.highValueHeldBy(c.id)} 颗）
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>在柜宝石</span>
              <select value={gemId} onChange={(e) => setGemId(e.target.value)}>
                <option value="">请选择宝石</option>
                {inCabinetGems.map((g) => {
                  const locked = derived.lockedCabinetIds.includes(g.cabinetId ?? "");
                  return (
                    <option key={g.id} value={g.id}>
                      {g.id} {g.kind} {g.carat.toFixed(2)}ct
                      {isHighValue(g) ? " · 高价值" : ""}
                      {locked ? " · 柜已锁" : ""}
                    </option>
                  );
                })}
              </select>
            </label>
          </div>
          {selectedGem && (
            <p className="hint">
              {selectedGem.kind} · {selectedGem.shape} · 净度 {selectedGem.clarity} ·{" "}
              {selectedGem.color} · {selectedGem.cut} · 镶位 {selectedGem.settingPosition} ·
              估值 {selectedGem.value.toLocaleString()} 元 →{" "}
              {isHighValue(selectedGem) ? "需两名当班人员确认" : "需一名当班人员确认"}
            </p>
          )}
          <div className="confirmer-row">
            <span>当班确认人（按宝石等级需 1–2 人）</span>
            <div className="chips">
              {onDutyStaff.map((s) => (
                <button
                  key={s.id}
                  className={confirmerIds.includes(s.id) ? "chip-picked" : ""}
                  onClick={() => toggleConfirmer(s.id)}
                >
                  {confirmerIds.includes(s.id) ? "✓ " : ""}
                  {s.name}
                </button>
              ))}
            </div>
          </div>
          <button className="primary block" disabled={!gemId} onClick={submitCheckout}>
            办理领用
          </button>

          <div className="heading" style={{ marginTop: 28 }}>
            <div>
              <p>归还办理</p>
              <h2>归还复核</h2>
            </div>
          </div>
          <div className="field-grid">
            <label>
              <span>已领宝石</span>
              <select
                value={returnGemId}
                onChange={(e) => {
                  setReturnGemId(e.target.value);
                  const g = state.gems.find((x) => x.id === e.target.value);
                  setActualCarat(g ? g.carat.toFixed(2) : "");
                }}
              >
                <option value="">请选择宝石</option>
                {checkedOutGems.map((g) => {
                  const holder = state.craftsmen.find((c) => c.id === g.holderId);
                  return (
                    <option key={g.id} value={g.id}>
                      {g.id} {g.kind}（{holder?.name ?? "未知"}持有）
                    </option>
                  );
                })}
              </select>
            </label>
            <label>
              <span>
                复核称重（ct）{returnGem && `· 存档 ${returnGem.carat.toFixed(2)}ct`}
              </span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={actualCarat}
                onChange={(e) => setActualCarat(e.target.value)}
                placeholder="归还时实测克拉"
              />
            </label>
          </div>
          <label className="check-row">
            <input
              type="checkbox"
              checked={seatDamaged}
              onChange={(e) => setSeatDamaged(e.target.checked)}
            />
            <span>镶口检查发现伤痕（勾选后将转待复核）</span>
          </label>
          <button className="primary block" disabled={!returnGemId} onClick={submitReturn}>
            办理归还
          </button>
        </section>
      </section>

      <section className="panel">
        <div className="heading">
          <div>
            <p>柜位存档</p>
            <h2>柜位占用</h2>
          </div>
          <button onClick={() => actions.reset()}>重置存档</button>
        </div>
        {state.cabinets.map((cab) => {
          const locked = derived.lockedCabinetIds.includes(cab.id);
          return (
            <div key={cab.id} className="cabinet-block">
              <h3>
                {locked ? "🔒 " : ""}
                {cab.name}
                <span className="muted">
                  {" "}
                  · 凭证 {cab.insurance?.certNo ?? "缺失"}，有效期至{" "}
                  {cab.insurance?.expiresAt ?? "—"}
                </span>
              </h3>
              <div className="slots">
                {derived.slotViews
                  .filter((s) => s.cabinetId === cab.id)
                  .map((s) => (
                    <div
                      key={s.slotId}
                      className={`slot ${s.gem ? "slot-full" : "slot-empty"}`}
                    >
                      <b>{s.label}</b>
                      {s.gem ? (
                        <>
                          <span>{s.gem.id}</span>
                          <small>
                            {s.gem.kind} {s.gem.carat.toFixed(2)}ct
                            {isHighValue(s.gem) ? " · 高价值" : ""}
                          </small>
                        </>
                      ) : (
                        <small>空槽位</small>
                      )}
                    </div>
                  ))}
              </div>
            </div>
          );
        })}
      </section>

      <section className="workspace">
        <section className="panel">
          <div className="heading">
            <div>
              <p>待复核</p>
              <h2>复核队列</h2>
            </div>
          </div>
          {derived.pendingReview.length === 0 ? (
            <p className="muted">暂无待复核宝石</p>
          ) : (
            <div className="records">
              {derived.pendingReview.map((g) => (
                <article key={g.id}>
                  <b>复</b>
                  <div>
                    <h3>
                      {g.id} {g.kind}
                      <em className="badge badge-warn">待复核</em>
                    </h3>
                    <p>
                      存档 {g.carat.toFixed(2)}ct · 关联订单 {g.orderId ?? "无"}（暂缓结项）
                    </p>
                    <button className="primary" onClick={() => actions.resolveReview(g.id)}>
                      复核通过回柜
                    </button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="panel">
          <div className="heading">
            <div>
              <p>按订单查看</p>
              <h2>订单结项</h2>
            </div>
          </div>
          <div className="records">
            {state.orders.map((o) => {
              const check = validateCloseOrder(state, o.id);
              return (
                <article key={o.id}>
                  <b>{o.closed ? "结" : "单"}</b>
                  <div>
                    <h3>
                      {o.id} {o.title}
                      {o.closed && <em className="badge badge-ok">已结项</em>}
                    </h3>
                    <p>
                      {o.gemIds
                        .map((id) => {
                          const g = state.gems.find((x) => x.id === id);
                          return g ? `${id}（${statusText[g.status]}）` : id;
                        })
                        .join(" · ")}
                    </p>
                    {!o.closed &&
                      (check.ok ? (
                        <button className="primary" onClick={() => actions.closeOrder(o.id)}>
                          订单结项
                        </button>
                      ) : (
                        <p className="reason">不能结项：{check.reason}</p>
                      ))}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      </section>

      <section className="panel">
        <div className="heading">
          <div>
            <p>流水存档</p>
            <h2>领还记录</h2>
          </div>
        </div>
        <div className="records">
          {state.events.map((e, i) => (
            <article key={e.id}>
              <b>{String(state.events.length - i).padStart(2, "0")}</b>
              <div>
                <h3>{e.text}</h3>
                <p>{e.time}</p>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

export default App;
