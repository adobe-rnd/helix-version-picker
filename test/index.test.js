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

/* eslint-env mocha */

'use strict';

process.env.HELIX_FETCH_FORCE_HTTP1 = true;

const assert = require('assert');
const nock = require('nock');
const { main } = require('../src/index.js');
const { retrofit } = require('./utils.js');

const index = retrofit(main);

describe('Index Tests', () => {
  afterEach(() => {
    nock.cleanAll();
  });

  it('returns 400 if owner is missing', async () => {
    const result = await index({});
    assert.deepEqual(result, {
      body: 'owner, repo, ref required.',
      headers: {
        'cache-control': 'no-store, private, must-revalidate',
        'content-type': 'text/plain; charset=utf-8',
      },
      statusCode: 400,
    });
  });

  it('returns 400 if repo is missing', async () => {
    const result = await index({
      __ow_headers: {
        'x-owner': 'test-owner',
      },
    });
    assert.deepEqual(result, {
      body: 'owner, repo, ref required.',
      headers: {
        'cache-control': 'no-store, private, must-revalidate',
        'content-type': 'text/plain; charset=utf-8',
      },
      statusCode: 400,
    });
  });

  it('returns 400 if ref is missing', async () => {
    const result = await index({
      __ow_headers: {
        'x-owner': 'test-owner',
        'x-repo': 'test-repo',
      },
    });
    assert.deepEqual(result, {
      body: 'owner, repo, ref required.',
      headers: {
        'cache-control': 'no-store, private, must-revalidate',
        'content-type': 'text/plain; charset=utf-8',
      },
      statusCode: 400,
    });
  });

  it('index function returns the version from github', async () => {
    nock('https://raw.githubusercontent.com')
      .get('/test-owner/test-repo/main/helix-version.txt')
      .reply(200, 'foo-bar');

    const result = await index({
      __ow_headers: {
        'x-owner': 'test-owner',
        'x-repo': 'test-repo',
        'x-ref': 'main',
      },
    });
    assert.deepEqual(result, {
      body: 'foo-bar',
      statusCode: 200,
      headers: {
        'cache-control': 'no-store, private, must-revalidate',
        'x-pages-version': 'foo-bar',
        'surrogate-control': 'max-age: 30',
        'surrogate-key': 'preflight-main--test-repo--test-owner',
        vary: 'X-Owner,X-Repo,X-Ref,X-Repo-Root-Path',
        'content-type': 'text/plain; charset=utf-8',
      },
    });
  });

  it('index function returns the version from github with alternate root', async () => {
    nock('https://www.example.com')
      .get('/test-owner/test-repo/main/helix-version.txt')
      .reply(200, 'foo-bar');

    const result = await index({
      __ow_headers: {
        'x-owner': 'test-owner',
        'x-repo': 'test-repo',
        'x-ref': 'main',
        'x-repo-root-path': 'https://www.example.com',
      },
    });
    assert.deepEqual(result, {
      body: 'foo-bar',
      statusCode: 200,
      headers: {
        'cache-control': 'no-store, private, must-revalidate',
        'x-pages-version': 'foo-bar',
        'surrogate-control': 'max-age: 30',
        'surrogate-key': 'preflight-main--test-repo--test-owner',
        vary: 'X-Owner,X-Repo,X-Ref,X-Repo-Root-Path',
        'content-type': 'text/plain; charset=utf-8',
      },
    });
  });

  it('index function returns 404 the version does not exist on github', async () => {
    nock('https://raw.githubusercontent.com')
      .get('/test-owner/test-repo/main/helix-version.txt')
      .reply(404);

    const result = await index({
      __ow_headers: {
        'x-owner': 'test-owner',
        'x-repo': 'test-repo',
        'x-ref': 'main',
      },
    });
    assert.deepEqual(result, {
      body: 'no version',
      statusCode: 200,
      headers: {
        'cache-control': 'no-store, private, must-revalidate',
        'surrogate-control': 'max-age: 30',
        'surrogate-key': 'preflight-main--test-repo--test-owner',
        vary: 'X-Owner,X-Repo,X-Ref,X-Repo-Root-Path',
        'content-type': 'text/plain; charset=utf-8',
      },
    });
  });

  it('index function returns 504 if github errors', async () => {
    nock('https://raw.githubusercontent.com')
      .get('/test-owner/test-repo/main/helix-version.txt')
      .reply(500);

    const result = await index({
      __ow_headers: {
        'x-owner': 'test-owner',
        'x-repo': 'test-repo',
        'x-ref': 'main',
      },
    });
    assert.deepEqual(result, {
      body: 'unable to fetch version',
      statusCode: 504,
      headers: {
        'cache-control': 'no-store, private, must-revalidate',
        'content-type': 'text/plain; charset=utf-8',
      },
    });
  });
});
