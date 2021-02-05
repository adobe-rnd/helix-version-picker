/*
 * Copyright 2019 Adobe. All rights reserved.
 * This file is licensed to you under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License. You may obtain a copy
 * of the License at http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software distributed under
 * the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR REPRESENTATIONS
 * OF ANY KIND, either express or implied. See the License for the specific language
 * governing permissions and limitations under the License.
 */
const URL = require('url');
const { wrap } = require('@adobe/openwhisk-action-utils');
const { logger } = require('@adobe/openwhisk-action-logger');
const { wrap: status } = require('@adobe/helix-status');
const { epsagon } = require('@adobe/helix-epsagon');
const fetchAPI = require('@adobe/helix-fetch');

function createFetchContext() {
  /* istanbul ignore next */
  if (process.env.HELIX_FETCH_FORCE_HTTP1) {
    return fetchAPI.context({ alpnProtocols: [fetchAPI.ALPN_HTTP1_1] });
  }
  /* istanbul ignore next */
  return fetchAPI.context({});
}
const fetchContext = createFetchContext();
const { fetch } = fetchContext;

function computeGithubURI(root, owner, repo, ref, path) {
  const rootURI = URL.parse(root);
  const rootPath = rootURI.path;
  // remove double slashes
  const fullPath = `${rootPath}/${owner}/${repo}/${ref}/${path}`.replace(
    /\/+/g,
    '/',
  );

  rootURI.pathname = fullPath;
  return URL.format(rootURI);
}

/**
 * Generates an error response
 * @param {string} message - error message
 * @param {number} statusCode - error code.
 * @returns response
 */
function error(message, statusCode) {
  return {
    statusCode,
    headers: {
      'Cache-Control': 'no-store, private, must-revalidate',
    },
    body: message,
  };
}

async function getVersion(url) {
  const fetchopts = {
    cache: 'no-store',
    signal: fetchContext.timeoutSignal(5000),
    'Cache-Control': 'no-cache',
  };
  const resp = await fetch(url, fetchopts);
  const text = await resp.text();
  if (resp.ok) {
    // todo: validate if proper version
    return text.trim();
  }
  if (resp.status !== 404) {
    throw Error(`github error: ${resp.status} ${text}`);
  }
  return '';
}

/**
 * This is the main function
 * @returns {object} a greeting
 */
async function main(params) {
  const {
    __ow_logger: log,
    __ow_headers: {
      'x-owner': owner,
      'x-repo': repo,
      'x-ref': ref,
      'x-repo-root-path': root = 'https://raw.githubusercontent.com/',
    } = {},
  } = params;

  if (!owner || !repo || !ref) {
    log.warn('owner, repo, ref missing');
    return error('owner, repo, ref required.', 400);
  }

  let version = '';

  try {
    const url = computeGithubURI(root, owner, repo, ref, '/helix-version.txt');
    version = await getVersion(url);
  } catch (e) {
    log.error('error while fetching version', e);
    return error('unable to fetch version', 504);
  }
  log.info(`version for ${repo}/${owner}#${ref} = "${version}"`);
  const surrogateKey = `preflight-${ref}--${repo}--${owner}`;

  if (version) {
    return {
      statusCode: 200,
      body: version,
      headers: {
        'x-pages-version': version,
        'Cache-Control': 'no-store, private, must-revalidate', // todo: proper caching ??
        'Surrogate-Control': 'max-age: 30',
        'Surrogate-Key': surrogateKey,
        Vary: 'X-Owner,X-Repo,X-Ref,X-Repo-Root-Path',
      },
    };
  }
  return {
    statusCode: 200,
    body: 'no version',
    headers: {
      'Cache-Control': 'no-store, private, must-revalidate', // todo: proper caching ??
      'Surrogate-Control': 'max-age: 30',
      'Surrogate-Key': surrogateKey,
      Vary: 'X-Owner,X-Repo,X-Ref,X-Repo-Root-Path',
    },
  };
}

module.exports.main = wrap(main)
  .with(epsagon)
  .with(status)
  .with(logger.trace)
  .with(logger);
