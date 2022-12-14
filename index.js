const core = require("@actions/core");
const github = require("@actions/github");
const createBranch = require("./create-branch");

async function run() {
  try {
    const sourceBranch = core.getInput("SOURCE_BRANCH", { required: true });
    const targetBranchPattern = core.getInput("TARGET_BRANCH_STARTS_WITH", {
      required: true,
    });
    const githubToken = core.getInput("GITHUB_TOKEN", { required: true });
    console.log(`Token value is ${githubToken}`); 
    console.log(`Target branch is ${targetBranchPattern}`);

    const {
      payload: { repository },
    } = github.context;

    const octokit = new github.getOctokit(githubToken);
    const { data: targetBranches } = await octokit.rest.git.listMatchingRefs({
      owner: repository.owner.login,
      repo: repository.name,
      ref: `heads/${targetBranchPattern}`,
    });

    for (let branchData of targetBranches) {
      const branch = branchData.ref.replace("refs/heads/", "");
      console.log(`Making a pull request for ${branch} from ${sourceBranch}.`);

      // get open pull requests
      const { data: currentPulls } = await octokit.rest.pulls.list({
        owner: repository.owner.login,
        repo: repository.name,
        state: "open",
      });

      const context = github.context;
      const newBranch = `${sourceBranch}-to-${branch}-${context.sha.slice(-4)}`;

      // see if we already have open PR between SOURCE and TARGET
      const currentPull = currentPulls.find((pull) => {
        console.log(pull.head.ref, pull.base.ref);
        return pull.head.ref === newBranch && pull.base.ref === branch;
      });

      if (!currentPull) {
        // create new branch from SOURCE_BRANCH and PR between new branch and target branch
        await createBranch(octokit, context, newBranch);

        const { data: pullRequest } = await octokit.rest.pulls.create({
          owner: repository.owner.login,
          repo: repository.name,
          head: newBranch,
          base: branch,
          title: `sync: ${sourceBranch} to ${branch}`,
          body: `sync-branches: syncing ${branch} with ${sourceBranch}`,
          draft: false,
        });

        console.log(
          `Pull request (${pullRequest.number}) successful! You can view it here: ${pullRequest.url}.`
        );

        core.setOutput("PULL_REQUEST_URL", pullRequest.url.toString());
        core.setOutput("PULL_REQUEST_NUMBER", pullRequest.number.toString());
      } else {
        // If PR exists update PR branch with sourceBranch
        console.log(
          `There is already a pull request (${currentPull.number}) to ${branch} from ${newBranch}.\n`
        );
        console.log("Updating PR branch...");

        await octokit.rest.repos.merge({
          owner: repository.owner.login,
          repo: repository.name,
          base: newBranch,
          head: context.sha,
        });

        console.log("PR branch updated\n");
        console.log(`You can view it here: ${currentPull.url}`);

        core.setOutput("PULL_REQUEST_URL", currentPull.url.toString());
        core.setOutput("PULL_REQUEST_NUMBER", currentPull.number.toString());
      }

      console.log(`Merging ${newBranch} to ${branch}`);
      const merge_response = await octokit.rest.repos.merge({
          owner: repository.owner.login,
          repo: repository.name,
          base: branch,
          head: newBranch,
        });

      console.log(`Result for the merge of ${newBranch} to ${branch}: ${merge_response.data}`);
      console.log(`${branch} is updated`);


    }
  } catch (error) {
    core.setFailed(error.message);
  }
}

run();
