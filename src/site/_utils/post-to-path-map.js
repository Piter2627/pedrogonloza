/*
 * Copyright 2019 Google LLC
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     https://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

const data = require('../content/en/learn/learn.11tydata.js').learn;

// =============================================================================
// POST HOST
//
// Returns a dictionary that reverse maps each guide (by ID) to its location
// inside a Path > Topic, based on the config inside `_data/paths/*.js`. Used
// to generate Lighthouse mapping data.
//
// =============================================================================

const postToPathMap = {};

const paths = [...data.paths, ...data.frameworks, ...data.audits];
paths.forEach((path) => {
  path.topics.forEach((topic) => {
    (topic.pathItems || []).forEach((slug) => {
      if (slug in postToPathMap) {
        const post = postToPathMap[slug];
        post.paths.push(path);
        post.topics.push(topic);
        return;
      }
      return postToPathMap[slug] = {
        paths: [path],
        topics: [topic],
      };
    });
  });
});


module.exports = {postToPathMap};
