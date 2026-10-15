import { GitError, type SyncAdapter } from "@/lib/git/types";

/**
 * A Git host in memory: branches are file maps, pull requests are rows. `mergePr()` and
 * `editMain()` play the person on the other side of the sync.
 */
export function fakeHost(initial: Record<string, string> = {}) {
  const branches = new Map<string, Map<string, string>>([
    ["main", new Map(Object.entries(initial))],
  ]);
  const shas = new Map<string, number>([["main", 1]]);
  const prs: {
    number: number;
    head: string;
    base: string;
    open: boolean;
    title: string;
    body: string;
  }[] = [];
  const log: string[] = [];
  let commitDelayMs = 0;
  let failWith: GitError | null = null;

  const sha = (name: string) => `sha-${name}-${shas.get(name) ?? 0}`;
  const need = (name: string) => {
    const b = branches.get(name);
    if (!b) throw new GitError("not_found");
    return b;
  };
  const bump = (name: string) => shas.set(name, (shas.get(name) ?? 0) + 1);
  const unsupported = async (): Promise<never> => {
    throw new GitError("unsupported");
  };

  const adapter: SyncAdapter = {
    provider: "github",
    async getRepository(ref) {
      return {
        fullName: ref.fullName,
        externalId: "1",
        defaultBranch: "main",
        headSha: sha("main"),
      };
    },
    async listBranches() {
      return [...branches.keys()].map((name) => ({ name, sha: sha(name) }));
    },
    listFiles: unsupported,
    async readFile(_ref, _t, input) {
      const text = need(input.ref ?? "main").get(input.path);
      if (text === undefined) throw new GitError("not_found");
      return text;
    },
    searchCode: unsupported,
    async getTree(_ref, _t, input) {
      if (failWith) throw failWith;
      return [...need(input.ref).entries()]
        .filter(([path]) => path.startsWith(`${input.path}/`))
        .map(([path, text]) => ({ path, size: text.length }));
    },
    async createBranch(_ref, _t, input) {
      if (!branches.has(input.name)) {
        branches.set(input.name, new Map(need(input.from)));
        shas.set(input.name, shas.get(input.from) ?? 1);
        log.push(`branch ${input.name}`);
      }
      return { name: input.name, sha: sha(input.name) };
    },
    async commitChanges(_ref, _t, input) {
      if (commitDelayMs) await new Promise((r) => setTimeout(r, commitDelayMs));
      if (input.branch === "main")
        throw new Error("the base branch must never be written directly");
      const files = need(input.branch);
      for (const f of input.files) files.set(f.path, f.content);
      bump(input.branch);
      log.push(`commit ${input.branch} ${input.files.map((f) => f.path).join(",")}`);
      return { sha: sha(input.branch) };
    },
    async createPullRequest(_ref, _t, input) {
      const pr = { number: prs.length + 1, ...input, open: true };
      prs.push(pr);
      log.push(`pr ${pr.number}`);
      return { number: pr.number, url: `https://github.com/acme/shop/pull/${pr.number}` };
    },
    async findOpenPullRequest(_ref, _t, input) {
      const pr = prs.find((p) => p.open && p.head === input.head && p.base === input.base);
      return pr
        ? { number: pr.number, url: `https://github.com/acme/shop/pull/${pr.number}` }
        : null;
    },
    async updatePullRequest(_ref, _t, input) {
      const pr = prs.find((p) => p.number === input.number);
      if (pr) Object.assign(pr, { title: input.title, body: input.body });
      log.push(`pr-update ${input.number}`);
    },
    async resetBranch(_ref, _t, input) {
      const target = [...branches.keys()].find((n) => sha(n) === input.to);
      branches.set(input.name, new Map(need(target ?? "main")));
      log.push(`reset ${input.name}`);
    },
  };

  return {
    adapter,
    log,
    prs,
    main: () => branches.get("main") as Map<string, string>,
    branch: (name: string) => branches.get(name),
    editMain(path: string, content: string) {
      need("main").set(path, content);
      bump("main");
    },
    removeFromMain(path: string) {
      need("main").delete(path);
      bump("main");
    },
    /** Merges the open pull request: the sync branch's files land on main. */
    mergePr() {
      const pr = prs.find((p) => p.open);
      if (!pr) throw new Error("no open pull request");
      for (const [path, text] of need(pr.head)) need("main").set(path, text);
      bump("main");
      pr.open = false;
    },
    closePr() {
      for (const p of prs) p.open = false;
    },
    slowCommits(ms: number) {
      commitDelayMs = ms;
    },
    failNextTree(error: GitError | null) {
      failWith = error;
    },
  };
}
