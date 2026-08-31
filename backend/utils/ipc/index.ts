import { app, ipcMain } from "electron";
import os from "node:os";

export interface SystemInfo {
  appVersion: string;
  electronVersion: string;
  chromeVersion: string;
  nodeVersion: string;
  v8Version: string;
  platform: string;
  arch: string;
  osVersion: string;
  hostname: string;
  cpuModel: string;
  cpuCores: number;
  totalMemoryBytes: number;
  locale: string;
}

export interface SystemMetrics {
  usedMemoryBytes: number;
  totalMemoryBytes: number;
  appMemoryBytes: number;
  appCpuPercent: number;
  processCount: number;
  systemUptimeSec: number;
  appUptimeSec: number;
}

export function registerIpcHandlers(): void {
  ipcMain.handle("system:info", (): SystemInfo => {
    const cpus = os.cpus();

    return {
      appVersion: app.getVersion(),
      electronVersion: process.versions.electron,
      chromeVersion: process.versions.chrome,
      nodeVersion: process.versions.node,
      v8Version: process.versions.v8,
      platform: process.platform,
      arch: process.arch,
      osVersion: os.version(),
      hostname: os.hostname(),
      cpuModel: cpus[0]?.model.trim() ?? "Unknown",
      cpuCores: cpus.length,
      totalMemoryBytes: os.totalmem(),
      locale: app.getLocale(),
    };
  });

  ipcMain.handle("system:metrics", (): SystemMetrics => {
    const metrics = app.getAppMetrics();

    // Aggregate memory and CPU across all Electron processes (main, gpu, renderers)
    const appMemoryBytes = metrics.reduce(
      (total, proc) => total + proc.memory.workingSetSize * 1024,
      0,
    );
    const appCpuPercent = metrics.reduce(
      (total, proc) => total + proc.cpu.percentCPUUsage,
      0,
    );

    return {
      usedMemoryBytes: os.totalmem() - os.freemem(),
      totalMemoryBytes: os.totalmem(),
      appMemoryBytes,
      appCpuPercent,
      processCount: metrics.length,
      systemUptimeSec: os.uptime(),
      appUptimeSec: process.uptime(),
    };
  });

  // Used by the renderer to measure IPC round-trip latency
  ipcMain.handle("system:ping", () => "pong");
}
