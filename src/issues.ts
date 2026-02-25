import * as github from "@actions/github";

const ISSUE_TITLE = "Lighthouse Performance Alert";
const LABELS = ["lighthouse", "performance"];

type Octokit = ReturnType<typeof github.getOctokit>;

function getRepo() {
  return github.context.repo;
}

/** Find an open issue with matching title and label. Returns issue number or null. */
export async function findOpenIssue(octokit: Octokit): Promise<number | null> {
  try {
    const { owner, repo } = getRepo();
    const { data: issues } = await octokit.rest.issues.listForRepo({
      owner,
      repo,
      state: "open",
      labels: LABELS[0],
      per_page: 50,
    });

    const match = issues.find((i) => i.title.includes(ISSUE_TITLE));
    return match?.number ?? null;
  } catch {
    return null;
  }
}
