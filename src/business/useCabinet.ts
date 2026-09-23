// 页面状态：reducer 承接领用/归还/复核/结项/补证动作，
// 每次状态变化写回存档；派生数据（柜位视图、持有数、待镶数）统一在这里计算

import { useEffect, useMemo, useReducer } from "react";
import {
  CabinetState,
  Gem,
  evaluateReturn,
  findFreeSlot,
  holdingsOf,
  isCabinetLocked,
  isHighValue,
  pendingSettingCount,
  unreturnedHighValueCount,
  validateCheckout,
  validateCloseOrder,
} from "./rules";
import { loadState, resetState, saveState } from "./store";

export type CabinetAction =
  | { type: "checkout"; gemId: string; craftsmanId: string; confirmerIds: string[] }
  | { type: "return"; gemId: string; actualCarat: number; seatDamaged: boolean }
  | { type: "resolve-review"; gemId: string }
  | { type: "renew-insurance"; cabinetId: string }
  | { type: "close-order"; orderId: string }
  | { type: "reset" };

const nowText = () => new Date().toLocaleString("zh-CN", { hour12: false });

function log(state: CabinetState, text: string): CabinetState {
  const events = [
    { id: Date.now() + Math.floor(Math.random() * 1000), time: nowText(), text },
    ...state.events,
  ].slice(0, 60);
  return { ...state, events };
}

function withNotice(state: CabinetState, notice: string): CabinetState {
  return { ...state, notice };
}

function reducer(state: CabinetState, action: CabinetAction): CabinetState {
  switch (action.type) {
    case "checkout": {
      const check = validateCheckout(state, action);
      if (!check.ok) return withNotice(log(state, `领用被拒：${check.reason}`), check.reason);

      const gem = state.gems.find((g) => g.id === action.gemId)!;
      const craftsman = state.craftsmen.find((c) => c.id === action.craftsmanId)!;
      const gems = state.gems.map((g) =>
        g.id === gem.id
          ? { ...g, status: "checked-out" as const, holderId: craftsman.id, slotId: null }
          : g
      );
      const slots = state.slots.map((s) => (s.gemId === gem.id ? { ...s, gemId: null } : s));
      const tag = isHighValue(gem) ? "高价值（双人确认）" : "普通（单人确认）";
      const text = `领用：${gem.id} ${gem.kind} → ${craftsman.name}，${tag}`;
      return withNotice(log({ ...state, gems, slots }, text), text);
    }

    case "return": {
      const gem = state.gems.find((g) => g.id === action.gemId);
      if (!gem || gem.status !== "checked-out")
        return withNotice(state, "该宝石不在已领状态，无法归还");

      const holder = state.craftsmen.find((c) => c.id === gem.holderId);
      const { needsReview, reasons } = evaluateReturn({
        expectedCarat: gem.carat,
        actualCarat: action.actualCarat,
        seatDamaged: action.seatDamaged,
      });

      if (needsReview) {
        // 称重差异或镶口伤痕 → 待复核，暂不回柜
        const gems = state.gems.map((g) =>
          g.id === gem.id ? { ...g, status: "pending-review" as const, holderId: null } : g
        );
        const text = `归还转待复核：${gem.id}（${reasons.join("；")}），关联订单暂不能结项`;
        return withNotice(log({ ...state, gems }, text), text);
      }

      const cabinetId = gem.cabinetId ?? state.cabinets[0]?.id;
      const freeSlot = cabinetId ? findFreeSlot(state, cabinetId) : undefined;
      if (!freeSlot) return withNotice(state, "柜内没有空槽位，无法回柜");

      const gems = state.gems.map((g) =>
        g.id === gem.id
          ? { ...g, status: "in-cabinet" as const, holderId: null, slotId: freeSlot.id }
          : g
      );
      const slots = state.slots.map((s) => (s.id === freeSlot.id ? { ...s, gemId: gem.id } : s));
      const text = `归还入柜：${gem.id} ← ${holder?.name ?? "未知"}，入 ${freeSlot.label} 槽位，称重复核一致`;
      return withNotice(log({ ...state, gems, slots }, text), text);
    }

    case "resolve-review": {
      const gem = state.gems.find((g) => g.id === action.gemId);
      if (!gem || gem.status !== "pending-review")
        return withNotice(state, "该宝石不在待复核状态");

      const cabinetId = gem.cabinetId ?? state.cabinets[0]?.id;
      const freeSlot = cabinetId ? findFreeSlot(state, cabinetId) : undefined;
      if (!freeSlot) return withNotice(state, "柜内没有空槽位，无法回柜");

      const gems = state.gems.map((g) =>
        g.id === gem.id ? { ...g, status: "in-cabinet" as const, slotId: freeSlot.id } : g
      );
      const slots = state.slots.map((s) => (s.id === freeSlot.id ? { ...s, gemId: gem.id } : s));
      const text = `复核通过：${gem.id} 回 ${freeSlot.label} 槽位，关联订单恢复可结项`;
      return withNotice(log({ ...state, gems, slots }, text), text);
    }

    case "renew-insurance": {
      const cabinet = state.cabinets.find((c) => c.id === action.cabinetId);
      if (!cabinet) return state;
      const expires = new Date();
      expires.setFullYear(expires.getFullYear() + 1);
      const expiresAt = expires.toISOString().slice(0, 10);
      const cabinets = state.cabinets.map((c) =>
        c.id === cabinet.id
          ? {
              ...c,
              insurance: {
                certNo: `${c.insurance?.certNo ?? "INS"}-续${expiresAt.slice(0, 4)}`,
                expiresAt,
              },
            }
          : c
      );
      const text = `保险凭证已补齐：${cabinet.name} 新凭证有效期至 ${expiresAt}，柜体解锁`;
      return withNotice(log({ ...state, cabinets }, text), text);
    }

    case "close-order": {
      const check = validateCloseOrder(state, action.orderId);
      if (!check.ok) return withNotice(log(state, `结项被拒：${check.reason}`), check.reason);
      const orders = state.orders.map((o) =>
        o.id === action.orderId ? { ...o, closed: true } : o
      );
      const text = `订单结项：${action.orderId}`;
      return withNotice(log({ ...state, orders }, text), text);
    }

    case "reset":
      return resetState();

    default:
      return state;
  }
}

export interface SlotView {
  slotId: string;
  label: string;
  cabinetId: string;
  gem: Gem | null;
}

export function useCabinet() {
  const [state, dispatch] = useReducer(reducer, undefined as unknown as CabinetState, () =>
    loadState()
  );

  // 每次领还/复核/补证后写回存档，重开页面按存档恢复
  useEffect(() => {
    saveState(state);
  }, [state]);

  const derived = useMemo(() => {
    const now = new Date();
    const slotViews: SlotView[] = state.slots.map((s) => ({
      slotId: s.id,
      label: s.label,
      cabinetId: s.cabinetId,
      gem: state.gems.find((g) => g.id === s.gemId) ?? null,
    }));
    const lockedCabinetIds = state.cabinets
      .filter((c) => isCabinetLocked(c, now))
      .map((c) => c.id);
    const holdings = new Map(state.craftsmen.map((c) => [c.id, holdingsOf(state, c.id)]));
    return {
      slotViews,
      lockedCabinetIds,
      holdings,
      inCabinetCount: state.gems.filter((g) => g.status === "in-cabinet").length,
      pendingSetting: pendingSettingCount(state),
      pendingReview: state.gems.filter((g) => g.status === "pending-review"),
      unreturnedHighValue: state.gems.filter(
        (g) => g.status === "checked-out" && isHighValue(g)
      ).length,
      highValueHeldBy: (craftsmanId: string) =>
        unreturnedHighValueCount(state, craftsmanId),
    };
  }, [state]);

  const actions = useMemo(
    () => ({
      checkout: (gemId: string, craftsmanId: string, confirmerIds: string[]) =>
        dispatch({ type: "checkout", gemId, craftsmanId, confirmerIds }),
      returnGem: (gemId: string, actualCarat: number, seatDamaged: boolean) =>
        dispatch({ type: "return", gemId, actualCarat, seatDamaged }),
      resolveReview: (gemId: string) => dispatch({ type: "resolve-review", gemId }),
      renewInsurance: (cabinetId: string) =>
        dispatch({ type: "renew-insurance", cabinetId }),
      closeOrder: (orderId: string) => dispatch({ type: "close-order", orderId }),
      reset: () => dispatch({ type: "reset" }),
    }),
    []
  );

  return { state, derived, actions };
}
