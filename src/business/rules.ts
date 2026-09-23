// 业务规则：领用确认、锁柜、归还复核、订单结项的纯函数判定
// 不依赖 React / 存储，方便单测与复用

export type GemStatus = "in-cabinet" | "checked-out" | "pending-review" | "set";

export interface Gem {
  id: string; // 宝石编号
  kind: string; // 种类
  shape: string; // 形状
  carat: number; // 存档克拉重量
  clarity: string; // 净度
  color: string; // 颜色
  cut: string; // 切工
  settingPosition: string; // 镶嵌位置
  value: number; // 估值（元）
  status: GemStatus;
  cabinetId: string | null;
  slotId: string | null;
  holderId: string | null; // 当前持有师傅
  orderId: string | null; // 关联订单
}

export interface Cabinet {
  id: string;
  name: string;
  insurance: { certNo: string; expiresAt: string } | null; // 保险凭证
}

export interface CabinetSlot {
  id: string;
  cabinetId: string;
  label: string;
  gemId: string | null;
}

export interface Craftsman {
  id: string;
  name: string;
}

export interface StaffMember {
  id: string;
  name: string;
  onDuty: boolean; // 是否当班
}

export interface Order {
  id: string;
  title: string;
  gemIds: string[];
  closed: boolean;
}

export interface CabinetEvent {
  id: number;
  time: string;
  text: string;
}

export interface CabinetState {
  gems: Gem[];
  cabinets: Cabinet[];
  slots: CabinetSlot[];
  craftsmen: Craftsman[];
  staff: StaffMember[];
  orders: Order[];
  events: CabinetEvent[];
  notice: string | null; // 最近一次办理结果提示
}

// ---- 规则常量 ----
export const HIGH_VALUE_THRESHOLD = 30000; // 估值达到即视为高价值宝石
export const MAX_UNRETURNED_HIGH_VALUE = 2; // 未还高价值宝石上限（颗）
export const WEIGHT_TOLERANCE_CT = 0.02; // 归还称重允许误差（克拉）

export const isHighValue = (gem: Gem): boolean => gem.value >= HIGH_VALUE_THRESHOLD;

export const gemById = (state: CabinetState, gemId: string): Gem | undefined =>
  state.gems.find((g) => g.id === gemId);

// 保险凭证过期 → 锁柜
export function isCabinetLocked(cabinet: Cabinet, now: Date = new Date()): boolean {
  if (!cabinet.insurance) return true;
  return new Date(cabinet.insurance.expiresAt + "T23:59:59").getTime() < now.getTime();
}

// 某师傅当前未还的高价值宝石数量
export function unreturnedHighValueCount(state: CabinetState, craftsmanId: string): number {
  return state.gems.filter(
    (g) => g.status === "checked-out" && g.holderId === craftsmanId && isHighValue(g)
  ).length;
}

// 师傅当前持有（待镶）的宝石
export function holdingsOf(state: CabinetState, craftsmanId: string): Gem[] {
  return state.gems.filter((g) => g.status === "checked-out" && g.holderId === craftsmanId);
}

// 全柜待镶数 = 已领出未归还的宝石数
export function pendingSettingCount(state: CabinetState): number {
  return state.gems.filter((g) => g.status === "checked-out").length;
}

export function findFreeSlot(state: CabinetState, cabinetId: string): CabinetSlot | undefined {
  return state.slots.find((s) => s.cabinetId === cabinetId && s.gemId === null);
}

export type RuleResult = { ok: true } | { ok: false; reason: string };

const onDutyConfirmerCount = (state: CabinetState, confirmerIds: string[]): number =>
  new Set(
    confirmerIds.filter((id) => state.staff.some((s) => s.id === id && s.onDuty))
  ).size;

// 领用校验：锁柜 → 确认人数 → 高价值限领
export function validateCheckout(
  state: CabinetState,
  input: { gemId: string; craftsmanId: string; confirmerIds: string[] },
  now: Date = new Date()
): RuleResult {
  const gem = gemById(state, input.gemId);
  if (!gem) return { ok: false, reason: "宝石不存在" };
  if (gem.status !== "in-cabinet") return { ok: false, reason: `${gem.id} 当前不在柜，不能领用` };
  if (!state.craftsmen.some((c) => c.id === input.craftsmanId))
    return { ok: false, reason: "请选择领用师傅" };

  const cabinet = state.cabinets.find((c) => c.id === gem.cabinetId);
  if (cabinet && isCabinetLocked(cabinet, now))
    return {
      ok: false,
      reason: `${cabinet.name}保险凭证已过期，柜体已锁定，补齐凭证后才能领用`,
    };

  const confirmers = onDutyConfirmerCount(state, input.confirmerIds);
  if (isHighValue(gem)) {
    if (
      unreturnedHighValueCount(state, input.craftsmanId) >= MAX_UNRETURNED_HIGH_VALUE
    )
      return {
        ok: false,
        reason: `该师傅未还的高价值宝石已达 ${MAX_UNRETURNED_HIGH_VALUE} 颗，不能再领高价值宝石`,
      };
    if (confirmers < 2)
      return { ok: false, reason: "高价值宝石须两名当班人员共同确认" };
  } else if (confirmers < 1) {
    return { ok: false, reason: "普通宝石须一名当班人员确认" };
  }
  return { ok: true };
}

// 归还判定：称重差异或镶口伤痕 → 待复核
export function evaluateReturn(input: {
  expectedCarat: number;
  actualCarat: number;
  seatDamaged: boolean;
}): { needsReview: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const diff = Math.abs(input.actualCarat - input.expectedCarat);
  if (diff > WEIGHT_TOLERANCE_CT)
    reasons.push(
      `称重差异 ${diff.toFixed(2)}ct（存档 ${input.expectedCarat.toFixed(2)}ct / 复核 ${input.actualCarat.toFixed(2)}ct，允差 ${WEIGHT_TOLERANCE_CT}ct）`
    );
  if (input.seatDamaged) reasons.push("镶口存在伤痕");
  return { needsReview: reasons.length > 0, reasons };
}

// 订单结项校验：关联宝石有待复核或未归还时不能结项
export function validateCloseOrder(state: CabinetState, orderId: string): RuleResult {
  const order = state.orders.find((o) => o.id === orderId);
  if (!order) return { ok: false, reason: "订单不存在" };
  if (order.closed) return { ok: false, reason: "订单已结项" };
  const gems = order.gemIds
    .map((id) => gemById(state, id))
    .filter((g): g is Gem => Boolean(g));
  if (gems.some((g) => g.status === "pending-review"))
    return { ok: false, reason: "存在待复核宝石，关联订单不能结项" };
  if (gems.some((g) => g.status === "checked-out"))
    return { ok: false, reason: "尚有已领未还的宝石，不能结项" };
  return { ok: true };
}
