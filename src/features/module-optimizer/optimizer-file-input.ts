import { validateLocalProfilePackage } from "../../contracts/local-profile-package";
import { extractOptimizerInput, type OptimizerProfileInput } from "./optimizer-data";

/**
 * Accepts the same sanitized shapes as Profile Sync. Native local packages
 * additionally have their schema, credential boundary, and canonical seal
 * verified before their payload is exposed to the optimizer.
 */
export async function optimizerInputFromFileValue(
  value: unknown,
): Promise<OptimizerProfileInput> {
  if (
    isRecord(value) &&
    (Object.hasOwn(value, "package_id") || Object.hasOwn(value, "request"))
  ) {
    const validation = await validateLocalProfilePackage(value);
    if (!validation.package) {
      throw new Error(
        `Local profile package failed validation: ${validation.errors.join(" ")}`,
      );
    }
    const input = extractOptimizerInput(validation.package.request.payload);
    const source = validation.package.source;
    const deployment = validation.package.request.payload.routing.deployment;
    return {
      ...input,
      presentationIdentity: {
        deployment,
        source_client_build: source.client_build,
        source_protocol_pack_digest: source.protocol_pack_digest,
      },
    };
  }
  return extractOptimizerInput(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
