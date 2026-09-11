/**
 * @fileoverview Standalone Atomic Rollback Command.
 * Implements DATA-014: Allows operators or automation to atomically rollback
 * to any prior validated immutable snapshot in the archive.
 * Usage: node scripts/rollback-snapshot.js <snapshot-id>
 */

import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  listAvailableSnapshots,
  rollbackToSnapshot,
} from "../server/pipeline/rollback-retention.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const storageDir = path.resolve(__dirname, "../public/data");

async function main() {
  const targetId = process.argv[2];

  if (!targetId) {
    console.log("Usage: node scripts/rollback-snapshot.js <snapshot-id>\n");
    console.log("Available snapshots in archive:");
    const list = listAvailableSnapshots(storageDir);
    for (const s of list) {
      console.log(
        `- ${s.snapshotId} [Date: ${s.sourceUpdatedAt}] (${s.totalCases} cases, ${s.totalDeaths} deaths)`,
      );
    }
    process.exit(1);
  }

  console.log(`🔄 Attempting atomic rollback to snapshot: ${targetId}...`);
  const result = rollbackToSnapshot(targetId, storageDir);
  if (!result.success) {
    console.error(`❌ Rollback failed: ${result.error}`);
    process.exit(1);
  }

  console.log(`✅ Successfully rolled back to ${targetId}!`);
  console.log(`   - Manifest and latest-snapshot.json updated.`);
  console.log(
    `   - Verified cases: ${result.snapshot.summary.totalCases.toLocaleString()}, deaths: ${result.snapshot.summary.totalDeaths.toLocaleString()}`,
  );
}

main().catch(console.error);
