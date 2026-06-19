import {
  App,
  Notice,
  Plugin,
  PluginSettingTab,
  Setting,
  TAbstractFile,
  TFile,
} from "obsidian";
import { promises as fs } from "fs";
import { exec } from "child_process";
import * as path from "path";
import { promisify } from "util";

const execAsync = promisify(exec);

interface BlogSyncSettings {
  blogRepoPath: string;
  postsSubdir: string;
  autoCommitPush: boolean;
  commitMessageTemplate: string;
}

const DEFAULT_SETTINGS: BlogSyncSettings = {
  blogRepoPath: "",
  postsSubdir: "posts",
  autoCommitPush: true,
  commitMessageTemplate: "post: {name}",
};

// A note already named YYYY-MM-DD (optionally -HHmm) keeps its name as-is.
const DATE_NAME_RE = /^\d{4}-\d{2}-\d{2}(-\d{4})?$/;

export default class BlogSyncPlugin extends Plugin {
  settings!: BlogSyncSettings;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.addCommand({
      id: "publish-current-note",
      name: "Publish current note to blog",
      checkCallback: (checking: boolean) => {
        const file = this.app.workspace.getActiveFile();
        if (!file || file.extension !== "md") return false;
        if (!checking) void this.publishFiles([file]);
        return true;
      },
    });

    // Right-click a single file in the explorer.
    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, file: TAbstractFile) => {
        if (file instanceof TFile && file.extension === "md") {
          menu.addItem((item) =>
            item
              .setTitle("Publish to blog")
              .setIcon("upload")
              .onClick(() => void this.publishFiles([file]))
          );
        }
      })
    );

    // Right-click a multi-file selection in the explorer.
    this.registerEvent(
      this.app.workspace.on("files-menu", (menu, files: TAbstractFile[]) => {
        const mds = files.filter(
          (f): f is TFile => f instanceof TFile && f.extension === "md"
        );
        if (mds.length) {
          menu.addItem((item) =>
            item
              .setTitle(`Publish ${mds.length} note(s) to blog`)
              .setIcon("upload")
              .onClick(() => void this.publishFiles(mds))
          );
        }
      })
    );

    this.addSettingTab(new BlogSyncSettingTab(this.app, this));
  }

  async publishFiles(files: TFile[]): Promise<void> {
    const repo = this.settings.blogRepoPath.trim();
    if (!repo) {
      new Notice("Blog Sync: set the blog repo path in settings first.");
      return;
    }
    const postsDir = path.join(repo, this.settings.postsSubdir);
    const written: string[] = [];

    try {
      await fs.mkdir(postsDir, { recursive: true });
      for (const file of files) {
        const name = await this.targetName(file, postsDir);
        const content = await this.app.vault.read(file);
        await fs.writeFile(path.join(postsDir, `${name}.md`), content, "utf8");
        written.push(name);
      }
    } catch (e) {
      new Notice(`Blog Sync: copy failed — ${errMsg(e)}`, 10000);
      return;
    }

    if (!written.length) return;

    if (!this.settings.autoCommitPush) {
      new Notice(`Copied ${written.join(", ")} to posts/ (push when ready).`);
      return;
    }

    try {
      const pushed = await this.commitAndPush(repo, written);
      new Notice(
        pushed
          ? `Published ${written.join(", ")} ✓ (deploying…)`
          : `No changes to publish (${written.join(", ")} already up to date).`
      );
    } catch (e) {
      new Notice(`Blog Sync: files copied but git failed —\n${errMsg(e)}`, 12000);
    }
  }

  /**
   * Keep a date-shaped note name; otherwise stamp the current date, adding
   * -HHmm only when today's file already exists (so nothing is clobbered).
   */
  async targetName(file: TFile, postsDir: string): Promise<string> {
    if (DATE_NAME_RE.test(file.basename)) return file.basename;
    const now = new Date();
    const day = formatDay(now);
    if (!(await exists(path.join(postsDir, `${day}.md`)))) return day;
    return `${day}-${formatTime(now)}`;
  }

  /** Returns true if a commit was actually pushed, false if nothing changed. */
  async commitAndPush(repo: string, names: string[]): Promise<boolean> {
    const opts = { cwd: repo };
    const sub = this.settings.postsSubdir;
    const subject =
      names.length === 1 ? names[0] : `${names.length} entries`;
    const msg = this.settings.commitMessageTemplate.replace("{name}", subject);

    await execAsync(`git add ${shellQuote(sub)}`, opts);
    // `git diff --cached --quiet` exits 0 (resolves) when nothing is staged.
    try {
      await execAsync("git diff --cached --quiet", opts);
      return false; // nothing staged
    } catch {
      // non-zero exit => there are staged changes => continue
    }
    await execAsync(`git commit -m ${shellQuote(msg)}`, opts);
    await execAsync("git push", opts);
    return true;
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}

async function exists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

const pad2 = (n: number): string => String(n).padStart(2, "0");

// Local-time YYYY-MM-DD, matching the daily-note naming convention.
function formatDay(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

function formatTime(d: Date): string {
  return `${pad2(d.getHours())}${pad2(d.getMinutes())}`;
}

// POSIX single-quote escaping (the plugin is desktop-only; macOS/Linux shells).
function shellQuote(s: string): string {
  return `'${s.replace(/'/g, `'\\''`)}'`;
}

function errMsg(e: unknown): string {
  if (e && typeof e === "object" && "stderr" in e) {
    const stderr = (e as { stderr?: unknown }).stderr;
    if (stderr) return String(stderr).trim();
  }
  if (e instanceof Error) return e.message;
  return String(e);
}

class BlogSyncSettingTab extends PluginSettingTab {
  plugin: BlogSyncPlugin;

  constructor(app: App, plugin: BlogSyncPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Blog repo path")
      .setDesc(
        "Absolute path to your locally-cloned blog repo (the folder containing posts/)."
      )
      .addText((t) =>
        t
          .setPlaceholder("/Users/you/Projects/blog")
          .setValue(this.plugin.settings.blogRepoPath)
          .onChange(async (v) => {
            this.plugin.settings.blogRepoPath = v.trim();
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Posts subfolder")
      .setDesc("Folder inside the repo where entries are written.")
      .addText((t) =>
        t.setValue(this.plugin.settings.postsSubdir).onChange(async (v) => {
          this.plugin.settings.postsSubdir = v.trim() || "posts";
          await this.plugin.saveSettings();
        })
      );

    new Setting(containerEl)
      .setName("Auto commit & push")
      .setDesc(
        "After copying, run git add/commit/push so the entry deploys automatically."
      )
      .addToggle((tg) =>
        tg
          .setValue(this.plugin.settings.autoCommitPush)
          .onChange(async (v) => {
            this.plugin.settings.autoCommitPush = v;
            await this.plugin.saveSettings();
          })
      );

    new Setting(containerEl)
      .setName("Commit message")
      .setDesc("Template for the commit subject. Use {name} for the entry name.")
      .addText((t) =>
        t
          .setValue(this.plugin.settings.commitMessageTemplate)
          .onChange(async (v) => {
            this.plugin.settings.commitMessageTemplate = v || "post: {name}";
            await this.plugin.saveSettings();
          })
      );
  }
}
