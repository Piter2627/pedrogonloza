const path = require('path');
const slugify = require('slugify');
const getYamlFrontMatter = require('../utils/get-yaml-front-matter');

/**
 * @param {Array<string>} files Files that should be linted.
 * @return {Array<string>} Error messages from failed lint rules.
 */
module.exports = async (files) => {
  const failures = [];
  for (file of files) {
    const frontMatter = await getYamlFrontMatter(file);
    const title = slugify(frontMatter.title);
    const dir = path.dirname(file).split('/').pop();
    if (title !== dir) {
      failures.push(`${file} title does not match dir name.`);
    }
  }
  return failures;
} 