import type { ModuleCandidate } from "./optimizer-types";

const MAX_MODULES = 4_096;
export const DEFAULT_EXACT_COMBINATION_LIMIT = 500_000n;

export interface OptimizerProfileInput {
  modules: ModuleCandidate[];
  currentInstanceIds: string[];
  presentationIdentity?: {
    deployment: string;
    source_client_build?: string;
    source_protocol_pack_digest?: string;
  };
}

export interface OptimizerDeviceCapabilities {
  hardwareConcurrency?: number;
  deviceMemoryGb?: number;
  mobile?: boolean;
}

export interface OptimizerComputeBudget {
  beamWidth: 64 | 128 | 256 | 512;
  label:
    | "constrained"
    | "mobile"
    | "balanced"
    | "thorough"
    | "workstation";
}

export function optimizerComputeBudget(
  capabilities: OptimizerDeviceCapabilities,
): OptimizerComputeBudget {
  const cores = positiveNumber(capabilities.hardwareConcurrency) ?? 4;
  const memoryGb = positiveNumber(capabilities.deviceMemoryGb);

  if (cores <= 2 || (memoryGb != null && memoryGb <= 2)) {
    return { beamWidth: 64, label: "constrained" };
  }
  if (cores <= 4 || (memoryGb != null && memoryGb <= 4)) {
    return {
      beamWidth: 128,
      label: capabilities.mobile ? "mobile" : "constrained",
    };
  }
  if (capabilities.mobile) {
    return { beamWidth: 128, label: "mobile" };
  }
  if (cores >= 12 && memoryGb != null && memoryGb >= 16) {
    return { beamWidth: 512, label: "workstation" };
  }
  if (cores >= 8 && (memoryGb == null || memoryGb >= 8)) {
    return { beamWidth: 512, label: "thorough" };
  }
  return { beamWidth: 256, label: "balanced" };
}

export function extractOptimizerModules(value: unknown): ModuleCandidate[] {
  return extractOptimizerInput(value).modules;
}

export function extractOptimizerInput(value: unknown): OptimizerProfileInput {
  const input = findInput(value);
  if (!input) {
    throw new Error(
      "JSON must be an inventory array, a modules object, or a profile envelope containing body.modules.inventory.",
    );
  }
  if (input.inventory.length === 0) {
    throw new Error("The module inventory is empty.");
  }
  if (input.inventory.length > MAX_MODULES) {
    throw new Error(`The module inventory exceeds the ${MAX_MODULES} item limit.`);
  }
  const modules = input.inventory.map((entry, index) =>
    normalizeModule(entry, index),
  );
  const currentInstanceIds = normalizeEquippedSlots(input.equippedSlots);
  const inventoryIds = new Set(modules.map((module) => module.instance_id));
  const missingCurrent = currentInstanceIds.find(
    (instanceId) => !inventoryIds.has(instanceId),
  );
  if (missingCurrent) {
    throw new Error(
      `Equipped module ${missingCurrent} is not present in the module inventory.`,
    );
  }
  return { modules, currentInstanceIds };
}

export function safeDemoModules(): ModuleCandidate[] {
  const attributes = [
    [1110, 1111],
    [1110, 2104],
    [1111, 1409],
    [1112, 1410],
    [1113, 2105],
    [1114, 2404],
    [1205, 2204],
    [1206, 2205],
    [1307, 2304],
    [1308, 2405],
    [1407, 2406],
    [1408, 1110],
  ];
  return attributes.map((parts, index) => ({
    instance_id: (9_007_199_254_740_993n + BigInt(index) * 2n).toString(),
    config_id: 5_500_101 + (index % 4),
    quality: 5,
    parts: parts.map((partId, partIndex) => ({
      part_id: partId,
      initial_link_points: 3 + ((index + partIndex * 3) % 8),
    })),
  }));
}

export function combinationCount(itemCount: number, selectionSize: number): bigint {
  if (
    !Number.isSafeInteger(itemCount) ||
    !Number.isSafeInteger(selectionSize) ||
    itemCount < 0 ||
    selectionSize < 0 ||
    selectionSize > itemCount
  ) {
    return 0n;
  }
  const smallerSide = Math.min(selectionSize, itemCount - selectionSize);
  let result = 1n;
  for (let index = 1; index <= smallerSide; index += 1) {
    result =
      (result * BigInt(itemCount - smallerSide + index)) / BigInt(index);
  }
  return result;
}

function findInput(
  value: unknown,
):
  | { inventory: unknown[]; equippedSlots?: unknown }
  | undefined {
  if (Array.isArray(value)) return { inventory: value };
  if (!isRecord(value)) return undefined;
  if (Array.isArray(value.inventory)) {
    return {
      inventory: value.inventory,
      equippedSlots: value.equipped_slots,
    };
  }
  if (Array.isArray(value.modules)) return { inventory: value.modules };
  if (isRecord(value.modules) && Array.isArray(value.modules.inventory)) {
    return {
      inventory: value.modules.inventory,
      equippedSlots: value.modules.equipped_slots,
    };
  }
  if (
    isRecord(value.body) &&
    isRecord(value.body.modules) &&
    Array.isArray(value.body.modules.inventory)
  ) {
    return {
      inventory: value.body.modules.inventory,
      equippedSlots: value.body.modules.equipped_slots,
    };
  }
  return undefined;
}

function normalizeEquippedSlots(value: unknown): string[] {
  if (value == null) return [];
  if (!isRecord(value)) {
    throw new Error("equipped_slots must be an object keyed by module slot.");
  }
  return Object.entries(value)
    .sort(([left], [right]) => numericSlot(left) - numericSlot(right))
    .map(([slot, instanceId]) => {
      numericSlot(slot);
      if (typeof instanceId !== "string" || instanceId.trim() === "") {
        throw new Error(`Equipped module slot ${slot} must contain a string instance ID.`);
      }
      return instanceId;
    });
}

function numericSlot(value: string): number {
  const slot = Number(value);
  if (!Number.isSafeInteger(slot) || slot < 0) {
    throw new Error(`Equipped module slot ${value} must be a non-negative integer.`);
  }
  return slot;
}

function normalizeModule(value: unknown, index: number): ModuleCandidate {
  if (!isRecord(value)) {
    throw new Error(`Module ${index + 1} must be an object.`);
  }
  if (typeof value.instance_id !== "string" || value.instance_id.trim() === "") {
    throw new Error(`Module ${index + 1} must have a string instance_id.`);
  }
  const configId = integer(value.config_id, `Module ${index + 1} config_id`);
  if (!Array.isArray(value.parts)) {
    throw new Error(`Module ${value.instance_id} must have a parts array.`);
  }
  const quality =
    value.quality == null
      ? null
      : integer(value.quality, `Module ${value.instance_id} quality`);
  return {
    instance_id: value.instance_id,
    config_id: configId,
    quality,
    parts: value.parts.map((part, partIndex) => {
      if (!isRecord(part)) {
        throw new Error(
          `Module ${value.instance_id} part ${partIndex + 1} must be an object.`,
        );
      }
      return {
        part_id: integer(
          part.part_id,
          `Module ${value.instance_id} part ${partIndex + 1} part_id`,
        ),
        initial_link_points: integer(
          part.initial_link_points,
          `Module ${value.instance_id} part ${partIndex + 1} initial_link_points`,
        ),
      };
    }),
  };
}

function integer(value: unknown, label: string): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new Error(`${label} must be a safe integer.`);
  }
  return value;
}

function positiveNumber(value: number | undefined): number | undefined {
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
