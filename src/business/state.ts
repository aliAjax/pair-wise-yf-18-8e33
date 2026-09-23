// =============================================================
// 页面状态层（React store / hooks）
// 负责把页面操作翻译成存档变更：变更前一律调用 rules.ts 校验，
// 变更后由 storage.ts 持久化。本文件不内置任何业务阈值。
// =============================================================

import { useCallback, useEffect, useMemo, useReducer, useRef } from "react";
import type { Archive, Gem } from "./rules";
import {
  assessReturn,
  canCloseOrder,
  outstandingHighGems,
  statusText,
  todayISO,
  validateCheckout,
} from "./rules";
import { clearArchive, createSeedArchive, getSavedAt, loadArchive, saveArchive } from "./storage";

export interface ActionResult {
  ok: boolean;
  reasons: string[];
}

type StoreAction =
  | { type: "checkout"; gemCode: string; masterId: string; confirmerIds: string[] }
  | { type: "returnGem"; gemCode: string; returnCarat: number; settingScar: boolean }
  | { type: "renewInsurance"; policyNo: string; expiresAt: string }
  | { type: "closeOrder"; orderId: string }
  | { type: "setDuty"; personId: string; onDuty: boolean }
  | { type: "reset" };

function nowText(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

function reducer(prev: Archive, action: StoreAction): Archive {
  // reset 由外层重新装载初始数据处理，这里不会收到
  const archive: Archive = structuredClone(prev);
  const log = (text: string) => archive.log.unshift({ at: nowText(), text });

  switch (action.type) {
    case "checkout": {
      const check = validateCheckout(archive, {
        gemCode: action.gemCode,
        masterId: action.masterId,
        confirmerIds: action.confirmerIds,
      });
      if (!check.ok) return prev;

      const gem = archive.gems.find((g) => g.code === action.gemCode)!;
      const master = archive.people.find((p) => p.id === action.masterId)!;
      const names = action.confirmerIds
        .map((id) => archive.people.find((p) => p.id === id)?.name ?? id)
        .join("、");
      gem.status = "held";
      gem.holderId = master.id;
      gem.checkoutAt = nowText();
      gem.checkoutCarat = gem.carat;
      gem.history.push({
        at: gem.checkoutAt,
        kind: "checkout",
        text: `${master.name}领用；当班确认：${names}`,
      });
      log(
        `${gem.code} ${gem.kind} ${gem.carat}ct 由${master.name}领用（${
          gem.tier === "high" ? "高价值·双确认" : "普通·单确认"
        }：${names}）`
      );
      return archive;
    }

    case "returnGem": {
      const gem = archive.gems.find((g) => g.code === action.gemCode);
      if (!gem || gem.status !== "held") return prev;
      const holder = archive.people.find((p) => p.id === gem.holderId);

      const assessment = assessReturn(gem, action.returnCarat, action.settingScar);
      gem.returnCarat = action.returnCarat;
      gem.settingScar = action.settingScar;
      gem.lastHolderId = gem.holderId;
      gem.holderId = undefined;

      if (assessment.toReview) {
        gem.status = "review";
        gem.history.push({
          at: nowText(),
          kind: "review",
          text: assessment.reasons.join("；"),
        });
        log(`${gem.code} 归还${assessment.reasons.join("、")}，转待复核；关联订单 ${gem.orderId} 不能结项`);
      } else {
        gem.status = "done";
        gem.history.push({ at: nowText(), kind: "return-ok", text: "称重一致、镶口完好，正常回柜" });
        log(`${gem.code} 由${holder?.name ?? "师傅"}正常归还回柜，${gem.orderId} 待镶数 -1`);
      }
      return archive;
    }

    case "renewInsurance": {
      archive.insurance = { policyNo: action.policyNo.trim(), expiresAt: action.expiresAt };
      log(`保险凭证已补齐：${action.policyNo.trim()}，有效期至 ${action.expiresAt}，领用柜解锁`);
      return archive;
    }

    case "closeOrder": {
      const check = canCloseOrder(archive, action.orderId);
      if (!check.ok) return prev;
      const order = archive.orders.find((o) => o.id === action.orderId)!;
      order.closed = true;
      log(`订单 ${order.id} ${order.title} 已结项`);
      return archive;
    }

    case "setDuty": {
      const person = archive.people.find((p) => p.id === action.personId);
      if (!person || person.onDuty === action.onDuty) return prev;
      person.onDuty = action.onDuty;
      log(`${person.name}${action.onDuty ? "上班到岗" : "下班离岗"}`);
      return archive;
    }

    default:
      return prev;
  }
}

export function useCabinetStore() {
  const [archive, dispatch] = useReducer((state: Archive, action: StoreAction): Archive => {
    if (action.type === "reset") return createSeedArchive();
    return reducer(state, action);
  }, undefined, loadArchive);

  const savedAtRef = useRef<string | null>(getSavedAt());

  // 存档变化即落盘，重开页面按存档继续
  useEffect(() => {
    savedAtRef.current = saveArchive(archive);
  }, [archive]);

  const checkout = useCallback(
    (gemCode: string, masterId: string, confirmerIds: string[]): ActionResult => {
      const check = validateCheckout(archive, { gemCode, masterId, confirmerIds });
      if (check.ok) dispatch({ type: "checkout", gemCode, masterId, confirmerIds });
      return check;
    },
    [archive]
  );

  const returnGem = useCallback(
    (gemCode: string, returnCarat: number, settingScar: boolean): ActionResult => {
      const gem = archive.gems.find((g) => g.code === gemCode);
      if (!gem || gem.status !== "held") {
        return { ok: false, reasons: ["该宝石不在持有中，不能归还"] };
      }
      if (!Number.isFinite(returnCarat) || returnCarat <= 0) {
        return { ok: false, reasons: ["请输入有效的归还称重（ct）"] };
      }
      dispatch({ type: "returnGem", gemCode, returnCarat, settingScar });
      const assessment = assessReturn(gem, returnCarat, settingScar);
      return assessment.toReview
        ? { ok: true, reasons: [`已转待复核：${assessment.reasons.join("；")}`] }
        : { ok: true, reasons: ["称重一致、镶口完好，已正常回柜"] };
    },
    [archive]
  );

  const renewInsurance = useCallback((policyNo: string, expiresAt: string): ActionResult => {
    if (!policyNo.trim()) return { ok: false, reasons: ["请输入新保险凭证号"] };
    if (!expiresAt) return { ok: false, reasons: ["请选择保险到期日"] };
    if (expiresAt <= todayISO()) {
      return { ok: false, reasons: ["到期日必须晚于今天，凭证仍会被判定为过期"] };
    }
    dispatch({ type: "renewInsurance", policyNo, expiresAt });
    return { ok: true, reasons: ["保险凭证已补齐，领用柜解锁"] };
  }, []);

  const closeOrder = useCallback(
    (orderId: string): ActionResult => {
      const check = canCloseOrder(archive, orderId);
      if (check.ok) dispatch({ type: "closeOrder", orderId });
      return check;
    },
    [archive]
  );

  const setDuty = useCallback((personId: string, onDuty: boolean) => {
    dispatch({ type: "setDuty", personId, onDuty });
  }, []);

  const resetToSeed = useCallback(() => {
    clearArchive();
    dispatch({ type: "reset" });
  }, []);

  // ---------------- 派生视图：柜位 / 持有数 / 待镶数 按存档显示 ----------------

  const slots = useMemo(() => {
    const rows = archive.gems
      .map((gem) => ({
        slot: gem.slot,
        gem,
        holderName: gem.holderId
          ? archive.people.find((p) => p.id === gem.holderId)?.name ?? gem.holderId
          : null,
      }))
      .sort((a, b) => a.slot.localeCompare(b.slot));
    return rows;
  }, [archive]);

  const holdings = useMemo(
    () =>
      archive.people
        .filter((p) => p.role === "master")
        .map((m) => {
          const held = archive.gems.filter((g) => g.status === "held" && g.holderId === m.id);
          const outHigh = outstandingHighGems(archive.gems, m.id);
          return {
            master: m,
            total: held.length,
            high: outHigh.length,
            blocked: outHigh.length > 2,
            gems: held,
          };
        }),
    [archive]
  );

  const orderBoard = useMemo(
    () =>
      archive.orders.map((order) => {
        const gems = archive.gems.filter((g) => g.orderId === order.id);
        const pending = gems.filter((g) => g.status !== "done");
        const review = gems.filter((g) => g.status === "review");
        const check = canCloseOrder(archive, order.id);
        return { order, gems, pending, review, closable: check.ok, blockReason: check.reasons[0] ?? "" };
      }),
    [archive]
  );

  return {
    archive,
    savedAt: savedAtRef.current,
    statusText,
    actions: { checkout, returnGem, renewInsurance, closeOrder, setDuty, resetToSeed },
    views: { slots, holdings, orderBoard },
  };
}

export type CabinetStore = ReturnType<typeof useCabinetStore>;
