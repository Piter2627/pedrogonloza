const core = require('@actions/core');
const getMarkdownFiles = require('./utils/get-markdown-files');
const lintAddedFiles = require('./linters/added-files');

try {
  const added = getMarkdownFiles(core.getInput('added'));
  (async () => {
    const failures = await lintAddedFiles(added);
    failures.forEach((failure) => core.setFailed(failure));
  })();
} catch(err) {
  core.setFailed(err);
} 