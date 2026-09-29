import { readFileSync } from "node:fs";
import vm from "node:vm";
import { describe, expect, it } from "vitest";

type ScriptContext = Record<string, any>;

function loadAppsScript(): ScriptContext {
  const context = vm.createContext({
    console,
    PropertiesService: { getScriptProperties: () => ({ getProperty: () => null }) },
  });
  const source = ["apps-script/Config.gs", "apps-script/Code.gs"]
    .map((path) => readFileSync(path, "utf8"))
    .join("\n");
  vm.runInContext(source, context);
  return context as ScriptContext;
}

function fakeSheet(rows: unknown[][]): any {
  return {
    getLastRow: () => rows.length + 1,
    getRange: (_row: number, column: number, count: number, width: number) => ({
      getValues: () => rows.slice(0, count).map((row) => row.slice(column - 1, column - 1 + width)),
    }),
  };
}

describe("Apps Script access control", () => {
  it("loads active users with a valid role and their custom quotas", () => {
    const script = loadAppsScript();
    const sheet = fakeSheet([
      ["qc@example.com", "uploader", true, 12, 3456],
      ["disabled@example.com", "admin", false, 99, 9999],
    ]);

    expect(script.findAllowedUser_(sheet, " QC@EXAMPLE.COM ")).toEqual({
      email: "qc@example.com",
      role: "uploader",
      dailyFileLimit: 12,
      dailyByteLimit: 3456,
    });
    expect(script.findAllowedUser_(sheet, "disabled@example.com")).toBeNull();
  });

  it("blocks viewer accounts before decoding or writing a PDF", () => {
    const script = loadAppsScript();
    expect(() => script.uploadQcPdf_({}, { email: "viewer@example.com", role: "viewer" }))
      .toThrow();
    try {
      script.uploadQcPdf_({}, { email: "viewer@example.com", role: "viewer" });
    } catch (error) {
      expect(error).toMatchObject({ code: "FORBIDDEN", retryable: false });
    }
  });

  it("enforces per-user and global daily file/byte quotas", () => {
    const script = loadAppsScript();
    script.Utilities = {
      formatDate: (date: Date) => date.toISOString().slice(0, 10).replaceAll("-", ""),
    };
    const rows = [
      ["2026-09-29T01:00:00.000Z", "QC-1", "r1", "p1", "", "", "", "", "", "", "", "", "", 1, 600, "", "", "", "", "qc@example.com", "done"],
    ];
    const config = { globalDailyFileLimit: 10, globalDailyByteLimit: 10_000 };

    expect(() => script.enforceDailyQuota_(
      fakeSheet(rows),
      { email: "qc@example.com", dailyFileLimit: 1, dailyByteLimit: 1_000 },
      100,
      config,
      new Date("2026-09-29T02:00:00.000Z"),
    )).toThrow();
    try {
      script.enforceDailyQuota_(
        fakeSheet(rows),
        { email: "qc@example.com", dailyFileLimit: 1, dailyByteLimit: 1_000 },
        100,
        config,
        new Date("2026-09-29T02:00:00.000Z"),
      );
    } catch (error) {
      expect(error).toMatchObject({ code: "USER_DAILY_QUOTA" });
    }
  });

  it("rejects Shared Drive folders exposed to the whole domain", () => {
    const script = loadAppsScript();
    script.CacheService = { getScriptCache: () => ({ get: () => null, put: () => undefined }) };
    script.Drive = {
      Files: { get: () => ({ id: "folder", mimeType: "application/vnd.google-apps.folder", driveId: "drive", capabilities: { canAddChildren: true } }) },
      Permissions: { list: () => ({ permissions: [{ type: "domain", role: "reader" }] }) },
    };

    expect(() => script.validateStorageRoot_({ driveFolderId: "folder", requireSharedDrive: true })).toThrow();
    try {
      script.validateStorageRoot_({ driveFolderId: "folder", requireSharedDrive: true });
    } catch (error) {
      expect(error).toMatchObject({ code: "CONFIG_INVALID" });
    }
  });

  it("uses the highest existing daily QC sequence instead of row count", () => {
    const script = loadAppsScript();
    script.Utilities = { formatDate: () => "260929" };
    const sheet = fakeSheet([
      ["", "QC-260929-0001"],
      ["", "QC-260929-0003"],
    ]);
    expect(script.nextQcNo_(sheet, new Date())).toBe("QC-260929-0004");
  });
});
