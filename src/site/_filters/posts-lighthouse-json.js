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

const stripLanguage = require('../_filters/strip-language');
const {postToPathMap} = require('../_utils/post-to-path-map');

// Generate a JSON object which links posts to their Ligthhouse audits.
module.exports = (posts) => {
  const toArray = (raw) => (raw instanceof Array ? raw : [raw]);

  if (!posts) {
    throw new Error('No posts were passed to the filter!');
  }

  const guides = posts.map((post) => {
    const guide = {
      path: '',
      topic: '',
      id: post.fileSlug, // e.g. "test-post"
      lighthouse: toArray(post.data.web_lighthouse),
      title: post.data.title,
      url: stripLanguage(post.url),
    };

    const result = postToPathMap[post.fileSlug];
    if (!result) {
      // TODO(samthor): The post isn't included anywhere inside
      // `_data/paths/*.js`, so it can't be given a path or topic.
      return guide;
    }

    // It's possible that a post may be in more than one path,
    // for example, LH reuses some a11y audits in the SEO section.
    // When this happens, just return the first result.
    // This is a temporary solution until we switch over to using the
    // full LH report in our /measure page.
    guide.path = result.paths[0].title;
    guide.topic = result.topics[0].title;
    return guide;
  });

  return {guides};
};
