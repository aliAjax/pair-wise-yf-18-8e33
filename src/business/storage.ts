// =============================================================
// 持久化层（存档读写）
// 只依赖 localStorage 与 rules.ts 中的数据类型
// 不接后端、不发起网络请求；重开页面后按存档继续
// =============================================================

import type { Archive, Gem, GemTier } from "./rules";
import { todayISO } from "./rules";

const STORAGE_KEY = "gem-cabinet-archive-v1";
const SAVE_FLAG_KEY = "gem-cabinet-save-ts-v1";

// ---------------- 初始存档（演示用工作台快照） ----------------

interface SeedInput {
  code: string;
  kind: string;
  shape: string;
  carat: number;
  size: string;
  clarity: string;
  color: string;
  cut: string;
  mount: string;
  slot: string;
  tier: GemTier;
  orderId: string;
  status: Gem["status"];
  holderId?: string;
  daysAgo?: number;
  review?: { returnCarat: number; settingScar: boolean; daysAgo: number };
}

function daysAgoISO(n: number): string {
  const d = new Date();
  d.setDate(d.getDate() - n);
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

function seedGem(s: SeedInput): Gem {
  const gem: Gem = {
    code: s.code,
    kind: s.kind,
    shape: s.shape,
    carat: s.carat,
    size: s.size,
    clarity: s.clarity,
    color: s.color,
    cut: s.cut,
    mount: s.mount,
    slot: s.slot,
    tier: s.tier,
    orderId: s.orderId,
    status: s.status,
    history: [{ at: daysAgoISO(30), kind: "intake", text: "入库登记，称重存档" }],
  };
  if (s.status === "held" && s.holderId) {
    gem.holderId = s.holderId;
    gem.checkoutAt = daysAgoISO(s.daysAgo ?? 1);
    gem.checkoutCarat = s.carat;
    gem.history.push({
      at: gem.checkoutAt!,
      kind: "checkout",
      text: `${s.holderId === "M01" ? "周师傅" : "陈师傅"}领用`,
    });
  }
  if (s.status === "review" && s.review) {
    const at = daysAgoISO(s.review.daysAgo);
    gem.lastHolderId = s.holderId;
    gem.returnCarat = s.review.returnCarat;
    gem.settingScar = s.review.settingScar;
    gem.history.push({ at, kind: "review", text: "归还异常，转待复核" });
  }
  if (s.status === "done") {
    gem.history.push({ at: daysAgoISO(6), kind: "return-ok", text: "正常归还回柜，镶工完成" });
  }
  return gem;
}

export function createSeedArchive(): Archive {
  // 保险凭证已过期 4 天 → 首次打开即锁柜，演示「补齐后才能领」
  const expiry = new Date();
  expiry.setDate(expiry.getDate() - 4);
  const expired = expiry.toISOString().slice(0, 10);

  return {
    version: 1,
    insurance: { policyNo: "BX-2025-0731", expiresAt: expired },
    people: [
      { id: "M01", name: "周师傅", role: "master", onDuty: true },
      { id: "M02", name: "陈师傅", role: "master", onDuty: true },
      { id: "C01", name: "林保管", role: "clerk", onDuty: true },
      { id: "C02", name: "赵主管", role: "clerk", onDuty: true },
      { id: "C03", name: "孙会计", role: "clerk", onDuty: false },
    ],
    orders: [
      { id: "SO-2601", title: "蓝宝椭圆吊坠", customer: "王女士", closed: false },
      { id: "SO-2602", title: "围钻求婚戒", customer: "李先生", closed: false },
      { id: "SO-2603", title: "祖母绿胸针", customer: "许女士", closed: false },
      { id: "SO-2599", title: "红宝锁骨链", customer: "何女士", closed: false },
    ],
    gems: [
      // 周师傅已有 3 颗未还高价值石 → 被停领（归还一颗即可恢复）
      seedGem({ code: "ST-2101", kind: "红宝石", shape: "椭圆", carat: 1.21, size: "7.1×5.2mm", clarity: "VVS", color: "鸽血红", cut: "椭圆刻面", mount: "主石位", slot: "A-01", tier: "high", orderId: "SO-2601", status: "held", holderId: "M01", daysAgo: 5 }),
      seedGem({ code: "ST-2102", kind: "蓝宝石", shape: "梨形", carat: 1.05, size: "7.0×5.0mm", clarity: "VS", color: "皇家蓝", cut: "梨形刻面", mount: "副石位", slot: "A-02", tier: "high", orderId: "SO-2601", status: "held", holderId: "M01", daysAgo: 4 }),
      seedGem({ code: "ST-2103", kind: "金绿猫眼", shape: "圆蛋面", carat: 1.68, size: "7.4mm", clarity: "半透", color: "蜜糖色", cut: "素面", mount: "主石位", slot: "A-03", tier: "high", orderId: "SO-2603", status: "held", holderId: "M01", daysAgo: 3 }),
      // 陈师傅持有 1 颗普通石
      seedGem({ code: "ST-2204", kind: "小钻石", shape: "圆形", carat: 0.08, size: "2.6mm", clarity: "SI", color: "H", cut: "明亮式", mount: "围石B组", slot: "B-11", tier: "normal", orderId: "SO-2602", status: "held", holderId: "M02", daysAgo: 2 }),
      // 在柜高价值
      seedGem({ code: "ST-2104", kind: "蓝宝石", shape: "椭圆", carat: 1.86, size: "8.2×6.1mm", clarity: "VVS", color: "矢车菊", cut: "椭圆刻面", mount: "主石位", slot: "A-04", tier: "high", orderId: "SO-2601", status: "cabinet" }),
      seedGem({ code: "ST-2105", kind: "祖母绿", shape: "祖母绿切", carat: 2.34, size: "9.0×7.0mm", clarity: "SI(内含物)", color: "木佐绿", cut: "阶梯切", mount: "主石位", slot: "A-05", tier: "high", orderId: "SO-2603", status: "cabinet" }),
      // 在柜普通
      seedGem({ code: "ST-2201", kind: "小钻石", shape: "圆形", carat: 0.05, size: "2.2mm", clarity: "VS", color: "F", cut: "明亮式", mount: "围石A组", slot: "B-01", tier: "normal", orderId: "SO-2602", status: "cabinet" }),
      seedGem({ code: "ST-2202", kind: "小钻石", shape: "圆形", carat: 0.06, size: "2.4mm", clarity: "VS", color: "G", cut: "明亮式", mount: "围石A组", slot: "B-02", tier: "normal", orderId: "SO-2602", status: "cabinet" }),
      seedGem({ code: "ST-2203", kind: "沙弗莱", shape: "圆形", carat: 0.3, size: "4.2mm", clarity: "VVS", color: "翠绿", cut: "明亮式", mount: "点缀位", slot: "B-10", tier: "normal", orderId: "SO-2603", status: "cabinet" }),
      // 待复核：称重差异
      seedGem({ code: "ST-2205", kind: "小钻石", shape: "圆形", carat: 0.1, size: "3.0mm", clarity: "VS", color: "G", cut: "明亮式", mount: "围石C组", slot: "B-12", tier: "normal", orderId: "SO-2602", status: "review", holderId: "M02", review: { returnCarat: 0.083, settingScar: false, daysAgo: 1 } }),
      // 待复核：镶口伤痕（高价值）
      seedGem({ code: "ST-2106", kind: "红宝石", shape: "枕形", carat: 1.52, size: "6.8×6.0mm", clarity: "VVS", color: "正红", cut: "枕形刻面", mount: "主石位", slot: "A-06", tier: "high", orderId: "SO-2603", status: "review", holderId: "M02", review: { returnCarat: 1.52, settingScar: true, daysAgo: 1 } }),
      // 已完成订单的回柜石
      seedGem({ code: "ST-2301", kind: "红宝石", shape: "椭圆", carat: 0.72, size: "5.8×4.0mm", clarity: "VS", color: "红", cut: "椭圆刻面", mount: "主石位", slot: "C-01", tier: "normal", orderId: "SO-2599", status: "done" }),
    ],
    log: [
      { at: daysAgoISO(30), text: "系统建档：宝石分拣台账转为宝石领用柜" },
      { at: daysAgoISO(5), text: "ST-2101 红宝石 1.21ct 由周师傅领用（高价值，双确认）" },
      { at: daysAgoISO(1), text: "ST-2205 归还称重差异，转待复核；SO-2602 暂停结项" },
      { at: todayISO(), text: `提示：保险凭证 BX-2025-0731 已于 ${expired} 到期，柜体锁定` },
    ],
  };
}

// ---------------- 存档读写 ----------------

function looksLikeArchive(value: unknown): value is Archive {
  if (!value || typeof value !== "object") return false;
  const v = value as Partial<Archive>;
  return (
    v.version === 1 &&
    Array.isArray(v.gems) &&
    Array.isArray(v.people) &&
    Array.isArray(v.orders) &&
    Boolean(v.insurance)
  );
}

/** 读取存档：没有存档或存档损坏时回落到初始快照 */
export function loadArchive(): Archive {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as unknown;
      if (looksLikeArchive(parsed)) return parsed;
    }
  } catch {
    // localStorage 不可用 / JSON 损坏：回落初始数据
  }
  return createSeedArchive();
}

/**
 * 写入存档。返回存档时间戳。
 * 用同值标记拦截 React StrictMode 的重复提交，避免刷新时间戳抖动。
 */
export function saveArchive(archive: Archive): string {
  const ts = new Date().toISOString();
  const raw = JSON.stringify(archive);
  const flag = `${ts}|${raw.length}`;
  try {
    if (localStorage.getItem(SAVE_FLAG_KEY) !== flag) {
      localStorage.setItem(STORAGE_KEY, raw);
      localStorage.setItem(SAVE_FLAG_KEY, flag);
    }
  } catch {
    // 存储不可用时静默（页面仍可在内存中使用）
  }
  return ts;
}

export function clearArchive(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
    localStorage.removeItem(SAVE_FLAG_KEY);
  } catch {
    // ignore
  }
}

export function getSavedAt(): string | null {
  try {
    const flag = localStorage.getItem(SAVE_FLAG_KEY);
    return flag ? flag.split("|")[0] : null;
  } catch {
    return null;
  }
}
