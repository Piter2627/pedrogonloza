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

const {html} = require('common-tags');
const stripLanguage = require('../../_filters/strip-language');
const prettyDate = require('../../_filters/pretty-date');
const contributors = require('../../_data/contributors.json');

/* eslint-disable require-jsdoc,indent,max-len */

function renderUpdate(date) {
  return html`
    <li
      class="w-post-card__info-listitem w-post-card__info-listitem--updated"
    >
      Updated <time>${prettyDate(date)}</time>
    </li>
  `;
}

function renderInfo(data) {
  return html`
    <div class="w-post-card__info">
      <ul class="w-post-card__info-list">
        <li
          class="w-post-card__info-listitem w-post-card__info-listitem--category"
        >
          Article
        </li>
        ${data.updated && renderUpdate(data.updated)}
      </ul>
    </div>
  `;
}

function renderThumbnail(url, img, alt) {
  return html`
    <figure class="w-post-card__figure">
      <img class="w-post-card__image" src="${url + img}" alt="${alt}" />
    </figure>
  `;
}

function renderAuthors(authors) {
  function getFullName(id) {
    const {name} = contributors[id];
    return `${name.given} ${name.family}`;
  }
  let authorString;
  if (authors.length === 1) {
    authorString = getFullName(authors[0]);
  } else if (authors.length === 2) {
    authorString = `${getFullName(authors[0])} & ${getFullName(authors[1])}`;
  }
  return html`
    <div class="w-post-card__author">${authorString}</div>
  `;
}

/**
 * PostCard used to preview posts.
 * @param {Object} post An eleventy collection item with post data.
 * @return {string}
 */
module.exports = ({post, showInfo = false}) => {
  const url = stripLanguage(post.url);
  const data = post.data;

  // If the post does not provide a thumbnail, attempt to reuse the hero image.
  // Otherwise, omit the image entirely.
  const thumbnail = data.thumbnail || data.hero || null;
  const alt = data.alt || '';

  return html`
    <a href="${url}" class="w-card">
      <article class="w-post-card">
        ${showInfo && renderInfo(data)}
        <div
          class="w-post-card__cover ${thumbnail && `w-post-card__cover--with-image`}"
        >
          ${thumbnail && renderThumbnail(url, thumbnail, alt)}
          <h2
            class="${thumbnail
              ? `w-post-card__headline--with-image`
              : `w-post-card__headline`}"
          >
            ${data.title}
          </h2>
          
        </div>
        <div class="w-post-card__desc">
          <div class="w-post-card__byline">
            ${data.authors && renderAuthors(data.authors)}
            <div class="w-post-card__published">${prettyDate(data.date)}</div>
          </div>
          <p class="w-post-card__subhead">
            ${data.subhead || data.description}
          </p>
        </div>
      </article>
    </a>
  `;
};
