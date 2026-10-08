import * as fs from "node:fs";
import * as path from "node:path";
import { Capability } from "@open-agent/network";
import { createCliNetworkNode } from "./network.js";

export async function handleCapabilityList(options?: {
  format?: string;
  storageDir?: string;
}): Promise<void> {
  const node = await createCliNetworkNode(options?.storageDir);
  const caps = node.getCapabilityRegistry().list();

  if (options?.format === "json") {
    console.log(JSON.stringify(caps, null, 2));
    return;
  }

  console.log(`=== Available Capabilities (${caps.length}) ===`);
  console.log(
    "NAME".padEnd(22) +
      "VERSION".padEnd(10) +
      "RISK".padEnd(10) +
      "CAPABILITY ID".padEnd(30) +
      "DESCRIPTION"
  );
  console.log("-".repeat(90));

  for (const c of caps) {
    const desc = c.description.length > 30 ? c.description.slice(0, 29) + "…" : c.description;
    console.log(
      c.name.padEnd(22) +
        c.version.padEnd(10) +
        c.risk_level.padEnd(10) +
        c.capability_id.padEnd(30) +
        desc
    );
  }
}

export async function handleCapabilitySearch(
  query: string,
  options?: { format?: string; storageDir?: string }
): Promise<void> {
  const node = await createCliNetworkNode(options?.storageDir);
  const results = node.getCapabilityRegistry().search(query);

  if (options?.format === "json") {
    console.log(JSON.stringify(results, null, 2));
    return;
  }

  console.log(`=== Capability Search Results for "${query}" (${results.length}) ===`);
  for (const c of results) {
    console.log(`• ${c.name} (${c.capability_id}) [${c.risk_level}]`);
    console.log(`  ${c.description}`);
  }
}

export async function handleCapabilityInspect(
  capabilityId: string,
  options?: { format?: string; storageDir?: string }
): Promise<void> {
  const node = await createCliNetworkNode(options?.storageDir);
  const cap = node.getCapabilityRegistry().get(capabilityId);

  if (!cap) {
    console.error(`[Error] Capability not found: ${capabilityId}`);
    process.exitCode = 1;
    return;
  }

  if (options?.format === "json") {
    console.log(JSON.stringify(cap, null, 2));
    return;
  }

  console.log(`=== Capability Inspection: ${cap.capability_id} ===`);
  console.log(`Name:        ${cap.name}`);
  console.log(`Version:     ${cap.version}`);
  console.log(`Risk Level:  ${cap.risk_level}`);
  console.log(`Description: ${cap.description}`);
  console.log(`Permissions: ${cap.required_permissions.join(", ") || "none"}`);
  console.log(`Input Schema:`);
  console.log(JSON.stringify(cap.input_schema, null, 2));
  console.log(`Output Schema:`);
  console.log(JSON.stringify(cap.output_schema, null, 2));
}

export async function handleCapabilityRegister(
  manifestPath: string,
  options?: { storageDir?: string }
): Promise<void> {
  const node = await createCliNetworkNode(options?.storageDir);
  const fullPath = path.resolve(process.cwd(), manifestPath);

  if (!fs.existsSync(fullPath)) {
    console.error(`[Error] Manifest file not found: ${fullPath}`);
    process.exitCode = 1;
    return;
  }

  let capData: Capability;
  try {
    capData = JSON.parse(fs.readFileSync(fullPath, "utf-8"));
  } catch (err: any) {
    console.error(`[Error] Failed to parse JSON manifest: ${err.message}`);
    process.exitCode = 1;
    return;
  }

  try {
    node.getCapabilityRegistry().register(capData);
    await node.saveState();
    console.log(`[Success] Capability ${capData.capability_id} registered successfully.`);
    console.log(`Risk Level: ${capData.risk_level}`);
  } catch (err: any) {
    console.error(`[Security / Validation Error] Registration rejected: ${err.message}`);
    process.exitCode = 1;
  }
}

export async function handleCapabilityInvoke(
  agentId: string,
  capabilityId: string,
  options?: { params?: string; file?: string; storageDir?: string }
): Promise<void> {
  const node = await createCliNetworkNode(options?.storageDir);

  let parameters: Record<string, unknown> = {};
  if (options?.file) {
    const fPath = path.resolve(process.cwd(), options.file);
    if (!fs.existsSync(fPath)) {
      console.error(`[Error] Parameters file not found: ${fPath}`);
      process.exitCode = 1;
      return;
    }
    parameters = JSON.parse(fs.readFileSync(fPath, "utf-8"));
  } else if (options?.params) {
    try {
      parameters = JSON.parse(options.params);
    } catch {
      console.error(`[Error] Invalid JSON provided in --params`);
      process.exitCode = 1;
      return;
    }
  }

  console.log(
    `[Policy Gatekeeper] Checking authorization for ${capabilityId} on peer ${agentId}...`
  );

  try {
    const response = await node.invokeRemoteCapability({
      targetAgentId: agentId,
      capabilityId,
      input: parameters,
    });

    if (response.status === "COMPLETED") {
      console.log(`[Success] Remote capability executed successfully.`);
      console.log(`Status: ${response.status}`);
      if (response.signature) {
        console.log(`Signature: ${response.signature.slice(0, 32)}...`);
      }
      console.log(`Response Payload:`);
      console.log(JSON.stringify(response.output, null, 2));
    } else {
      console.error(
        `[Failure / Denied] Invocation status: ${response.status} - ${response.error || "Unknown error"}`
      );
      process.exitCode = 1;
    }
  } catch (err: any) {
    console.error(`[Failure / Denied] Invocation error: ${err.message || "Unknown error"}`);
    process.exitCode = 1;
  }
}
