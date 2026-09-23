// 持久化：种子数据 + localStorage 存档读写
// 领还后的柜位、持有数、待镶数都从这里恢复，重开页面继续

import type { CabinetState, Gem } from "./rules";

const STORAGE_KEY = "hxyfront-62006-gem-cabinet-v1";

const gem = (partial: Partial<Gem> & Pick<Gem, "id" | "kind" | "shape" | "carat" | "value">): Gem => ({
  clarity: "VS",
  color: "—",
  cut: "明亮式",
  settingPosition: "待定",
  status: "in-cabinet",
  cabinetId: "cab-a",
  slotId: null,
  holderId: null,
  orderId: null,
  ...partial,
});

export function seedState(): CabinetState {
  return {
    cabinets: [
      {
        id: "cab-a",
        name: "A柜 · 主石柜",
        // 凭证有效：2027-03-31 到期
        insurance: { certNo: "INS-A-2026-018", expiresAt: "2027-03-31" },
      },
      {
        id: "cab-b",
        name: "B柜 · 配石柜",
        // 凭证已过期（2026-08-31），用于演示锁柜
        insurance: { certNo: "INS-B-2025-044", expiresAt: "2026-08-31" },
      },
    ],
    slots: [
      ...["A-01", "A-02", "A-03", "A-04", "A-05", "A-06"].map((label) => ({
        id: `slot-${label}`,
        cabinetId: "cab-a",
        label,
        gemId: null as string | null,
      })),
      ...["B-01", "B-02", "B-03", "B-04", "B-05", "B-06"].map((label) => ({
        id: `slot-${label}`,
        cabinetId: "cab-b",
        label,
        gemId: null as string | null,
      })),
    ],
    gems: [
      gem({
        id: "ST-2048", kind: "蓝宝石", shape: "椭圆 6x4mm", carat: 1.2,
        clarity: "VVS", color: "皇家蓝", settingPosition: "主石位",
        value: 68000, slotId: "slot-A-01", orderId: "ORD-1001",
      }),
      gem({
        id: "ST-2061", kind: "钻石", shape: "圆形 0.08ct", carat: 0.08,
        clarity: "VS", color: "D-E", settingPosition: "围石A组",
        value: 3200, slotId: "slot-A-02", orderId: "ORD-1001",
      }),
      gem({
        id: "ST-2099", kind: "祖母绿", shape: "祖母绿切 7x5mm", carat: 1.5,
        clarity: "VS", color: "艳绿", cut: "祖母绿切", settingPosition: "主石位",
        value: 82000, slotId: "slot-A-03", orderId: "ORD-1002",
      }),
      gem({
        id: "ST-2105", kind: "红宝石", shape: "梨形 6x4mm", carat: 0.9,
        color: "鸽血红", settingPosition: "主石位",
        value: 46000, slotId: "slot-A-04", orderId: "ORD-1002",
      }),
      gem({
        id: "ST-2110", kind: "钻石", shape: "圆形 0.05ct", carat: 0.05,
        clarity: "SI", color: "F-G", settingPosition: "围石B组",
        value: 1800, slotId: "slot-B-01", orderId: "ORD-1001",
      }),
      gem({
        id: "ST-2116", kind: "碧玺", shape: "椭圆 5x3mm", carat: 0.6,
        color: "桃红", settingPosition: "配石位",
        value: 2600, slotId: "slot-B-02",
      }),
      gem({
        id: "ST-2121", kind: "尖晶石", shape: "圆形 4mm", carat: 0.4,
        color: "绯红", settingPosition: "配石位",
        value: 1500, slotId: "slot-B-03",
      }),
      gem({
        id: "ST-2130", kind: "蓝宝石", shape: "圆形 3.5mm", carat: 0.3,
        color: "矢车菊", settingPosition: "配石位",
        value: 5200, slotId: "slot-B-04",
      }),
      // 周师傅已领出两颗高价值主石：用于演示“未还超两颗不能再领”
      gem({
        id: "ST-2142", kind: "祖母绿", shape: "椭圆 6x4mm", carat: 1.1,
        color: "浓绿", settingPosition: "主石位",
        value: 39000, status: "checked-out", slotId: null, holderId: "cm-zhou", orderId: "ORD-1002",
      }),
      gem({
        id: "ST-2148", kind: "红宝石", shape: "椭圆 6.5x4.5mm", carat: 1.3,
        color: "鸽血红", settingPosition: "主石位",
        value: 58000, status: "checked-out", slotId: null, holderId: "cm-zhou", orderId: "ORD-1001",
      }),
      gem({
        id: "ST-2155", kind: "钻石", shape: "公主方 2.5mm", carat: 0.12,
        color: "F-G", settingPosition: "围石A组",
        value: 3600, status: "checked-out", slotId: null, holderId: "cm-lin", orderId: "ORD-1001",
      }),
      // 归还复核中的一颗：用于演示“待复核 → 订单不能结项”
      gem({
        id: "ST-2160", kind: "蓝宝石", shape: "梨形 5x3mm", carat: 0.8,
        color: "皇家蓝", settingPosition: "主石位",
        value: 21000, status: "pending-review", slotId: null, holderId: null, orderId: "ORD-1002",
      }),
    ],
    craftsmen: [
      { id: "cm-zhou", name: "周师傅" },
      { id: "cm-lin", name: "林师傅" },
      { id: "cm-chen", name: "陈师傅" },
    ],
    staff: [
      { id: "st-wang", name: "王雪", onDuty: true },
      { id: "st-li", name: "李航", onDuty: true },
      { id: "st-zhao", name: "赵敏", onDuty: true },
      { id: "st-qian", name: "钱峰", onDuty: false },
    ],
    orders: [
      {
        id: "ORD-1001",
        title: "凤冠婚戒套装",
        gemIds: ["ST-2048", "ST-2061", "ST-2110", "ST-2148", "ST-2155"],
        closed: false,
      },
      {
        id: "ORD-1002",
        title: "祖母绿套链",
        gemIds: ["ST-2099", "ST-2105", "ST-2142", "ST-2160"],
        closed: false,
      },
    ],
    events: [
      {
        id: 1,
        time: new Date().toLocaleString("zh-CN", { hour12: false }),
        text: "领用柜存档初始化：A柜凭证有效，B柜保险凭证已于 2026-08-31 过期（锁柜）",
      },
    ],
    notice: null,
  };
}

// 种子数据里 gem.slotId 已写好，这里同步槽位占用
function syncSlots(state: CabinetState): CabinetState {
  const slots = state.slots.map((s) => ({ ...s, gemId: null as string | null }));
  for (const g of state.gems) {
    if (g.status === "in-cabinet" && g.slotId) {
      const slot = slots.find((s) => s.id === g.slotId);
      if (slot) slot.gemId = g.id;
    }
  }
  return { ...state, slots };
}

export function loadState(): CabinetState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as CabinetState;
      if (parsed && Array.isArray(parsed.gems) && Array.isArray(parsed.slots)) {
        return parsed;
      }
    }
  } catch {
    // 存档损坏时回落到种子数据
  }
  return syncSlots(seedState());
}

export function saveState(state: CabinetState): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // 存储不可用时静默跳过，页面状态仍在内存中
  }
}

export function resetState(): CabinetState {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // ignore
  }
  return syncSlots(seedState());
}
