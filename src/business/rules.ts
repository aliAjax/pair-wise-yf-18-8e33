// =============================================================
// 业务规则层（纯函数）
// 不依赖 React、不依赖 localStorage、不接后端
// 领用双确认 / 高价值持有上限 / 保险锁柜 / 归还待复核 / 订单结项
// 全部规则集中在此，页面层与持久化层都只能调用这里的结论
// =============================================================

export type GemTier = "high" | "normal"; // high = 高价值宝石
export type GemStatus =
  | "cabinet" // 在柜（存档柜位）
  | "held" // 师傅领用持有中
  | "review" // 归还异常，转待复核
  | "done"; // 正常归还回柜，镶工完成

export type PersonRole = "master" | "clerk"; // 师傅 / 当班人员

export interface GemEvent {
  at: string;
  kind: "intake" | "checkout" | "return-ok" | "review";
  text: string;
}

export interface Gem {
  code: string; // 宝石编号
  kind: string; // 种类
  shape: string; // 形状
  carat: number; // 克拉重量（存档基准重量）
  size: string; // 尺寸
  clarity: string; // 净度
  color: string; // 颜色
  cut: string; // 切工
  mount: string; // 镶嵌位置
  slot: string; // 存档柜位
  tier: GemTier; // 价值级别
  orderId: string; // 关联订单
  status: GemStatus;
  holderId?: string; // 当前持有人（领用中）
  lastHolderId?: string; // 上一任持有人（待复核追溯用）
  checkoutAt?: string;
  checkoutCarat?: number; // 领出时读数
  returnCarat?: number; // 归还时读数
  settingScar?: boolean; // 镶口伤痕
  history: GemEvent[];
}

export interface Person {
  id: string;
  name: string;
  role: PersonRole;
  onDuty: boolean; // 是否当班
}

export interface ShopOrder {
  id: string;
  title: string;
  customer: string;
  closed: boolean;
}

export interface InsurancePolicy {
  policyNo: string; // 保险凭证号
  expiresAt: string; // 到期日 yyyy-mm-dd
}

export interface LogEntry {
  at: string;
  text: string;
}

export interface Archive {
  version: 1;
  insurance: InsurancePolicy;
  people: Person[];
  orders: ShopOrder[];
  gems: Gem[];
  log: LogEntry[];
}

// ---------------- 规则常量 ----------------

/** 未还高价值宝石上限：超过两颗（达到 3 颗）即停领 */
export const MAX_OUTSTANDING_HIGH = 2;

/** 称重允差：取 0.5% 与 0.002ct 中较大者，超出即判定为称重差异 */
export const RELATIVE_WEIGHT_TOLERANCE = 0.005;
export const MIN_WEIGHT_TOLERANCE_CT = 0.002;

// ---------------- 基础判定 ----------------

export function todayISO(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

export function isHighValue(gem: Gem): boolean {
  return gem.tier === "high";
}

/** 保险凭证有效：凭证号存在且到期日不早于今天。过期即锁柜 */
export function isPolicyValid(policy: InsurancePolicy, today = todayISO()): boolean {
  return policy.policyNo.trim().length > 0 && policy.expiresAt >= today;
}

/** 某师傅当前未还的高价值宝石（持有中才算未还；已进待复核的实物已交回） */
export function outstandingHighGems(gems: Gem[], masterId: string): Gem[] {
  return gems.filter((g) => g.status === "held" && g.holderId === masterId && isHighValue(g));
}

export function heldGems(gems: Gem[], masterId: string): Gem[] {
  return gems.filter((g) => g.status === "held" && g.holderId === masterId);
}

/** 订单待镶数：未正常归还回柜的宝石都算待镶（在柜待领 / 持有中 / 待复核） */
export function orderPendingCount(archive: Archive, orderId: string): number {
  return archive.gems.filter((g) => g.orderId === orderId && g.status !== "done").length;
}

export function orderReviewGems(archive: Archive, orderId: string): Gem[] {
  return archive.gems.filter((g) => g.orderId === orderId && g.status === "review");
}

// ---------------- 领用规则 ----------------

export interface CheckoutRequest {
  gemCode: string;
  masterId: string; // 领石师傅
  confirmerIds: string[]; // 当班确认人
}

export interface RuleResult {
  ok: boolean;
  reasons: string[];
}

export function validateCheckout(
  archive: Archive,
  req: CheckoutRequest,
  today = todayISO()
): RuleResult {
  const reasons: string[] = [];
  const gem = archive.gems.find((g) => g.code === req.gemCode);
  const master = archive.people.find((p) => p.id === req.masterId);

  // 1. 保险凭证过期先锁柜，任何领用都不受理
  if (!isPolicyValid(archive.insurance, today)) {
    reasons.push("保险凭证已过期，领用柜已锁定，补齐凭证后才能领用");
  }

  if (!gem) {
    reasons.push("宝石不存在");
    return { ok: false, reasons };
  }

  if (gem.status !== "cabinet") {
    reasons.push(`宝石 ${gem.code} 当前不在柜（${statusText(gem.status)}），不能领用`);
  }

  if (!master || master.role !== "master") {
    reasons.push("请选择领石师傅");
  } else if (!master.onDuty) {
    reasons.push(`师傅 ${master.name} 当前不当班`);
  } else {
    // 2. 未还高价值宝石超过两颗 → 不能再领（普通石也不能领）
    const outstanding = outstandingHighGems(archive.gems, master.id);
    if (outstanding.length > MAX_OUTSTANDING_HIGH) {
      reasons.push(
        `${master.name} 名下已有 ${outstanding.length} 颗未还高价值宝石（上限 ${MAX_OUTSTANDING_HIGH} 颗），须先归还才能继续领用`
      );
    }
  }

  // 3. 确认人规则：高价值两名当班人员，普通一名
  const need = gem && isHighValue(gem) ? 2 : 1;
  const ids = req.confirmerIds.map((s) => s.trim()).filter(Boolean);

  if (master && ids.includes(master.id)) {
    reasons.push("领石师傅本人不能作为确认人");
  }
  if (ids.length !== need) {
    reasons.push(
      isHighValue(gem)
        ? `高价值宝石须由两名当班人员确认（当前 ${ids.length} 名）`
        : `普通宝石须由一名当班人员确认（当前 ${ids.length} 名）`
    );
  } else if (new Set(ids).size !== ids.length) {
    reasons.push("两名确认人不能为同一人");
  } else {
    for (const id of ids) {
      const c = archive.people.find((p) => p.id === id);
      if (!c || c.role !== "clerk") reasons.push("确认人必须是当班人员");
      else if (!c.onDuty) reasons.push(`确认人 ${c.name} 当前不当班`);
    }
  }

  return { ok: reasons.length === 0, reasons };
}

// ---------------- 归还规则 ----------------

export interface ReturnAssessment {
  toReview: boolean;
  diff: number; // 归还 - 存档（ct）
  tolerance: number;
  reasons: string[];
}

/** 称重差异或镶口伤痕，任一成立即转待复核 */
export function assessReturn(gem: Gem, returnCarat: number, settingScar: boolean): ReturnAssessment {
  const tolerance = Math.max(
    gem.carat * RELATIVE_WEIGHT_TOLERANCE,
    MIN_WEIGHT_TOLERANCE_CT
  );
  const diff = Math.round((returnCarat - gem.carat) * 1000) / 1000;
  const weightAbnormal = Math.abs(diff) > tolerance + 1e-9;
  const reasons: string[] = [];
  if (weightAbnormal) {
    reasons.push(
      `称重差异 ${diff > 0 ? "+" : ""}${diff.toFixed(3)}ct，超出允差 ±${tolerance.toFixed(3)}ct`
    );
  }
  if (settingScar) reasons.push("归还检验发现镶口伤痕");
  return { toReview: weightAbnormal || settingScar, diff, tolerance, reasons };
}

/** 关联订单结项：有待复核宝石一律不能结项 */
export function canCloseOrder(archive: Archive, orderId: string): RuleResult {
  const order = archive.orders.find((o) => o.id === orderId);
  if (!order) return { ok: false, reasons: ["订单不存在"] };
  if (order.closed) return { ok: false, reasons: ["订单已结项"] };

  const review = orderReviewGems(archive, orderId);
  if (review.length > 0) {
    return {
      ok: false,
      reasons: [`${review.map((g) => g.code).join("、")} 处待复核，关联订单不能结项`],
    };
  }
  const pending = orderPendingCount(archive, orderId);
  if (pending > 0) {
    return { ok: false, reasons: [`仍有 ${pending} 颗宝石待镶，未全部归还入库`] };
  }
  return { ok: true, reasons: [] };
}

// ---------------- 展示文案 ----------------

export function statusText(status: GemStatus): string {
  return { cabinet: "在柜", held: "持有中", review: "待复核", done: "已回柜" }[status];
}
