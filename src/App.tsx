import { useMemo, useState, type ReactNode } from "react";
import "./styles.css";
import type { ActionResult } from "./business/state";
import { useCabinetStore } from "./business/state";
import type { Gem, GemStatus } from "./business/rules";
import {
  isPolicyValid,
  MAX_OUTSTANDING_HIGH,
  orderPendingCount,
  todayISO,
} from "./business/rules";

type DialogKind = null | "checkout" | "return" | "renew";

interface Notice {
  result: ActionResult;
  at: number;
}

function tierLabel(tier: Gem["tier"]): string {
  return tier === "high" ? "高价值" : "普通";
}

function App() {
  const store = useCabinetStore();
  const { archive, actions, views, statusText } = store;

  const [dialog, setDialog] = useState<DialogKind>(null);
  const [notice, setNotice] = useState<Notice | null>(null);
  const [orderFilter, setOrderFilter] = useState<string>("ALL");

  // 领用表单
  const [checkoutGem, setCheckoutGem] = useState("");
  const [masterId, setMasterId] = useState("");
  const [confirmer1, setConfirmer1] = useState("");
  const [confirmer2, setConfirmer2] = useState("");

  // 归还表单
  const [returnGemCode, setReturnGemCode] = useState("");
  const [returnCarat, setReturnCarat] = useState("");
  const [settingScar, setSettingScar] = useState(false);

  // 补保险表单
  const [policyNo, setPolicyNo] = useState("");
  const [expiresAt, setExpiresAt] = useState("");

  const locked = !isPolicyValid(archive.insurance);
  const cabinetGems = archive.gems.filter((g) => g.status === "cabinet");
  const heldGems = archive.gems.filter((g) => g.status === "held");
  const selectedGem = archive.gems.find((g) => g.code === checkoutGem);
  const needConfirmers = selectedGem?.tier === "high" ? 2 : 1;

  const totalPending = archive.orders.reduce(
    (sum, o) => sum + orderPendingCount(archive, o.id),
    0
  );

  const visibleSlots = useMemo(
    () =>
      orderFilter === "ALL"
        ? views.slots
        : views.slots.filter((row) => row.gem.orderId === orderFilter),
    [views.slots, orderFilter]
  );

  function flash(result: ActionResult) {
    setNotice({ result, at: Date.now() });
  }

  function openCheckout() {
    setCheckoutGem(cabinetGems[0]?.code ?? "");
    setMasterId(archive.people.find((p) => p.role === "master" && p.onDuty)?.id ?? "");
    setConfirmer1("");
    setConfirmer2("");
    setDialog("checkout");
  }

  function openReturn() {
    setReturnGemCode(heldGems[0]?.code ?? "");
    const first = heldGems[0];
    setReturnCarat(first ? first.carat.toFixed(2) : "");
    setSettingScar(false);
    setDialog("return");
  }

  function submitCheckout() {
    const ids = [confirmer1, confirmer2].filter(Boolean).slice(0, needConfirmers);
    const result = actions.checkout(checkoutGem, masterId, ids);
    flash(result);
    if (result.ok) setDialog(null);
  }

  function submitReturn() {
    const result = actions.returnGem(returnGemCode, parseFloat(returnCarat), settingScar);
    flash(result);
    if (result.ok) setDialog(null);
  }

  function submitRenew() {
    const result = actions.renewInsurance(policyNo, expiresAt);
    flash(result);
    if (result.ok) {
      setDialog(null);
      setPolicyNo("");
      setExpiresAt("");
    }
  }

  const stats: { label: string; value: number; tone: string }[] = [
    { label: "在柜宝石", value: archive.gems.filter((g) => g.status === "cabinet").length, tone: "teal" },
    { label: "持有中", value: heldGems.length, tone: "rose" },
    { label: "待复核", value: archive.gems.filter((g) => g.status === "review").length, tone: "amber" },
    { label: "全店待镶", value: totalPending, tone: "purple" },
  ];

  return (
    <main className="app">
      <section className="hero">
        <p>hxyfront-62006 · 珠宝镶嵌 · Port 62006</p>
        <h1>宝石领用柜</h1>
        <span>
          高价值宝石领用须两名当班人员确认，名下未还高价值石超过 {MAX_OUTSTANDING_HIGH} 颗即停领；
          普通宝石一人确认。保险凭证过期先锁柜，补齐再领。归还称重差异或镶口伤痕转待复核，关联订单不得结项。
          柜位、持有数、待镶数均按存档显示，重开继续。
        </span>
      </section>

      {locked && (
        <section className="lock-banner">
          <div>
            <strong>🔒 领用柜已锁定</strong>
            <p>
              保险凭证 {archive.insurance.policyNo} 已于 {archive.insurance.expiresAt} 到期。
              补齐有效凭证前，任何领用申请均不受理。
            </p>
          </div>
          <button className="primary" onClick={() => setDialog("renew")}>
            补齐保险凭证
          </button>
        </section>
      )}

      {notice && (
        <section className={`notice ${notice.result.ok ? "ok" : "fail"}`}>
          {notice.result.ok ? "✓ " : "✕ "}
          {notice.result.reasons.join("；") || (notice.result.ok ? "操作成功" : "操作未通过")}
        </section>
      )}

      <section className="metrics">
        {stats.map((s) => (
          <article key={s.label} className={s.tone}>
            <small>{s.label}</small>
            <strong>{s.value}</strong>
          </article>
        ))}
      </section>

      <section className="action-bar panel">
        <div className="heading">
          <div>
            <p>领用 / 归还</p>
            <h2>当班操作</h2>
          </div>
          <div className="btn-row">
            <button className="primary" disabled={locked} onClick={openCheckout}>
              师傅领石
            </button>
            <button onClick={openReturn} disabled={heldGems.length === 0}>
              归还检验
            </button>
            <button onClick={() => setDialog("renew")}>更新保险凭证</button>
          </div>
        </div>
        {locked && <p className="hint">锁柜期间「师傅领石」不可用；归还检验仍可进行（异常照样转待复核）。</p>}
        <p className="saved">
          存档时间：{store.savedAt ?? "本次会话"} ｜ 数据保存在本机浏览器，重开页面自动续档
          <button className="link" onClick={actions.resetToSeed}>
            重置演示数据
          </button>
        </p>
      </section>

      <section className="workspace">
        <aside className="panel">
          <h2>师傅持有数</h2>
          <div className="holdings">
            {views.holdings.map((h) => (
              <article key={h.master.id} className={h.blocked ? "blocked" : ""}>
                <div className="holding-head">
                  <strong>{h.master.name}</strong>
                  {h.master.onDuty ? <span className="tag duty">当班</span> : <span className="tag off">离岗</span>}
                  {h.blocked && <span className="tag block">已停领</span>}
                </div>
                <p>
                  持有 <b>{h.total}</b> 颗 ｜ 未还高价值 <b className={h.blocked ? "danger" : ""}>{h.high}</b>/{MAX_OUTSTANDING_HIGH} 颗
                </p>
                {h.blocked && (
                  <p className="danger-text">
                    未还高价值宝石超过 {MAX_OUTSTANDING_HIGH} 颗，须先归还才能继续领用
                  </p>
                )}
                {h.gems.length > 0 && (
                  <ul className="mini-list">
                    {h.gems.map((g) => (
                      <li key={g.code}>
                        {g.code} {g.kind} {g.carat}ct
                        {g.tier === "high" && <em className="high-tag">高</em>}
                      </li>
                    ))}
                  </ul>
                )}
              </article>
            ))}
          </div>

          <h2 className="mt">当班人员</h2>
          <div className="staff">
            {archive.people.map((p) => (
              <label key={p.id} className="staff-row">
                <span>
                  {p.name}
                  <small>{p.role === "master" ? "师傅" : "当班人员"}</small>
                </span>
                <input
                  type="checkbox"
                  checked={p.onDuty}
                  onChange={(e) => actions.setDuty(p.id, e.target.checked)}
                />
              </label>
            ))}
          </div>
        </aside>

        <section className="panel">
          <div className="heading">
            <div>
              <p>存档柜位</p>
              <h2>柜体台账</h2>
            </div>
            <select value={orderFilter} onChange={(e) => setOrderFilter(e.target.value)}>
              <option value="ALL">全部订单</option>
              {archive.orders.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.id} {o.title}
                </option>
              ))}
            </select>
          </div>
          <div className="slot-grid">
            {visibleSlots.map(({ slot, gem, holderName }) => (
              <article key={gem.code} className={`slot ${gem.status} ${gem.tier}`}>
                <header>
                  <b>{slot}</b>
                  <span className={`tag status-${gem.status}`}>{statusText(gem.status as GemStatus)}</span>
                </header>
                <h3>
                  {gem.code} <em className={gem.tier === "high" ? "high-tag" : "normal-tag"}>{tierLabel(gem.tier)}</em>
                </h3>
                <p>
                  {gem.kind} · {gem.shape} · {gem.carat}ct · {gem.size}
                </p>
                <p className="muted">
                  {gem.color} / {gem.clarity} / {gem.cut}
                </p>
                <p className="muted">{gem.mount} ｜ {gem.orderId}</p>
                {gem.status === "held" && <p className="holder">持有人：{holderName} · {gem.checkoutAt}</p>}
                {gem.status === "review" && (
                  <p className="review-reason">
                    待复核：
                    {[
                      gem.returnCarat !== undefined &&
                        `归还称重 ${gem.returnCarat}ct（存档 ${gem.carat}ct）`,
                      gem.settingScar && "镶口伤痕",
                    ]
                      .filter(Boolean)
                      .join("；")}
                  </p>
                )}
              </article>
            ))}
          </div>
        </section>
      </section>

      <section className="panel">
        <div className="heading">
          <div>
            <p>按订单查看</p>
            <h2>订单与待镶数</h2>
          </div>
        </div>
        <div className="orders">
          {views.orderBoard.map(({ order, gems, pending, review, closable, blockReason }) => (
            <article key={order.id} className={`order ${order.closed ? "closed" : ""}`}>
              <header>
                <h3>{order.id} {order.title}</h3>
                {order.closed ? <span className="tag done">已结项</span> : <span className="tag duty">进行中</span>}
              </header>
              <p className="muted">客户：{order.customer} ｜ 共 {gems.length} 颗</p>
              <p>
                待镶数 <b className={pending.length > 0 ? "danger" : ""}>{pending.length}</b>
                ｜ 在柜 {gems.filter((g) => g.status === "cabinet").length}
                ｜ 持有 {gems.filter((g) => g.status === "held").length}
                ｜ 待复核 <b className={review.length > 0 ? "danger" : ""}>{review.length}</b>
                ｜ 已回柜 {gems.filter((g) => g.status === "done").length}
              </p>
              {review.length > 0 && (
                <p className="review-reason">
                  关联待复核：{review.map((g) => `${g.code}（${g.settingScar ? "镶口伤痕" : "称重差异"}）`).join("、")}
                </p>
              )}
              <div className="order-foot">
                {!order.closed && !closable && <span className="block-note">⊘ {blockReason}</span>}
                {!order.closed && (
                  <button disabled={!closable} onClick={() => flash(actions.closeOrder(order.id))}>
                    结项
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="panel">
        <div className="heading">
          <div>
            <p>流水存档</p>
            <h2>领还记录</h2>
          </div>
        </div>
        <ul className="log">
          {archive.log.map((entry, i) => (
            <li key={`${entry.at}-${i}`}>
              <time>{entry.at}</time>
              <span>{entry.text}</span>
            </li>
          ))}
        </ul>
      </section>

      {dialog === "checkout" && (
        <Modal title="师傅领石" onClose={() => setDialog(null)}>
          {locked && <p className="modal-alert">🔒 保险凭证过期，柜体锁定中，请先补齐凭证。</p>}
          <label className="field">
            <span>选择宝石（在柜 {cabinetGems.length} 颗）</span>
            <select value={checkoutGem} onChange={(e) => setCheckoutGem(e.target.value)}>
              {cabinetGems.map((g) => (
                <option key={g.code} value={g.code}>
                  {g.code} {g.kind} {g.carat}ct · 柜位{g.slot} · {tierLabel(g.tier)} · {g.orderId}
                </option>
              ))}
            </select>
          </label>
          {selectedGem && (
            <div className={`gem-brief ${selectedGem.tier}`}>
              {tierLabel(selectedGem.tier)}宝石 · 存档重量 {selectedGem.carat}ct · 柜位 {selectedGem.slot} ·{" "}
              {needConfirmers === 2 ? "须两名当班人员确认" : "一名当班人员确认即可"}
            </div>
          )}
          <label className="field">
            <span>领石师傅</span>
            <select value={masterId} onChange={(e) => setMasterId(e.target.value)}>
              <option value="">请选择</option>
              {archive.people
                .filter((p) => p.role === "master")
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}（{p.onDuty ? "当班" : "离岗"}）
                  </option>
                ))}
            </select>
          </label>
          <label className="field">
            <span>当班确认人 1{needConfirmers === 2 ? "" : "（普通石）"}</span>
            <select value={confirmer1} onChange={(e) => setConfirmer1(e.target.value)}>
              <option value="">请选择</option>
              {archive.people
                .filter((p) => p.role === "clerk")
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}（{p.onDuty ? "当班" : "离岗"}）
                  </option>
                ))}
            </select>
          </label>
          {needConfirmers === 2 && (
            <label className="field">
              <span>当班确认人 2（高价值石必须两人）</span>
              <select value={confirmer2} onChange={(e) => setConfirmer2(e.target.value)}>
                <option value="">请选择（须与确认人1不同）</option>
                {archive.people
                  .filter((p) => p.role === "clerk")
                  .map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}（{p.onDuty ? "当班" : "离岗"}）
                    </option>
                  ))}
              </select>
            </label>
          )}
          <div className="modal-actions">
            <button onClick={() => setDialog(null)}>取消</button>
            <button className="primary" onClick={submitCheckout}>
              确认领用
            </button>
          </div>
        </Modal>
      )}

      {dialog === "return" && (() => {
        const gem = archive.gems.find((g) => g.code === returnGemCode);
        return (
          <Modal title="归还检验" onClose={() => setDialog(null)}>
            <label className="field">
              <span>选择归还宝石（持有中 {heldGems.length} 颗）</span>
              <select
                value={returnGemCode}
                onChange={(e) => {
                  const g = archive.gems.find((x) => x.code === e.target.value);
                  setReturnGemCode(e.target.value);
                  setReturnCarat(g ? g.carat.toFixed(2) : "");
                  setSettingScar(false);
                }}
              >
                {heldGems.map((g) => (
                  <option key={g.code} value={g.code}>
                    {g.code} {g.kind} {g.carat}ct · 持有人{" "}
                    {archive.people.find((p) => p.id === g.holderId)?.name} · {g.orderId}
                  </option>
                ))}
              </select>
            </label>
            {gem && (
              <div className={`gem-brief ${gem.tier}`}>
                存档重量 {gem.carat}ct · 柜位 {gem.slot} ·{" "}
                {gem.tier === "high" ? "高价值" : "普通"} · 关联订单 {gem.orderId}
              </div>
            )}
            <label className="field">
              <span>归还复称重量（ct）</span>
              <input
                type="number"
                step="0.001"
                min="0"
                value={returnCarat}
                onChange={(e) => setReturnCarat(e.target.value)}
              />
            </label>
            <label className="check-field">
              <input
                type="checkbox"
                checked={settingScar}
                onChange={(e) => setSettingScar(e.target.checked)}
              />
              <span>镶口检查发现伤痕</span>
            </label>
            <p className="hint">
              称重超出允差或勾选伤痕，归还后自动转「待复核」，关联订单在复核完成前不能结项。
            </p>
            <div className="modal-actions">
              <button onClick={() => setDialog(null)}>取消</button>
              <button className="primary" onClick={submitReturn}>
                提交检验
              </button>
            </div>
          </Modal>
        );
      })()}

      {dialog === "renew" && (
        <Modal title="补齐保险凭证" onClose={() => setDialog(null)}>
          <p className="hint">
            当前凭证 {archive.insurance.policyNo}，到期日 {archive.insurance.expiresAt}
            {locked ? "（已过期，柜已锁定）" : "（仍有效）"}。
          </p>
          <label className="field">
            <span>新保险凭证号</span>
            <input value={policyNo} onChange={(e) => setPolicyNo(e.target.value)} placeholder="例如 BX-2026-0008" />
          </label>
          <label className="field">
            <span>到期日（须晚于今天 {todayISO()}）</span>
            <input type="date" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
          </label>
          <div className="modal-actions">
            <button onClick={() => setDialog(null)}>取消</button>
            <button className="primary" onClick={submitRenew}>
              补齐并解锁
            </button>
          </div>
        </Modal>
      )}
    </main>
  );
}

function Modal({ title, children, onClose }: { title: string; children: ReactNode; onClose: () => void }) {
  return (
    <div className="modal-mask" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <header>
          <h2>{title}</h2>
          <button className="modal-close" onClick={onClose}>
            ×
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}

export default App;
