#!/usr/bin/env node
/**
 * Submit a listed Firefox Add-ons (AMO) version via the v5 API.
 *
 * Why this exists instead of `publish-browser-extension` for Firefox:
 * That tool always POSTs create-version as multipart FormData (with an empty
 * `source` field) via a Node Readable stream. After a long AMO validation wait,
 * that request frequently fails in CI with undici "other side closed" — upload
 * + validation succeed, but the version is never created. Mozilla's docs use
 * JSON `{ "upload": "<uuid>" }` when no source zip is attached; that avoids the
 * flaky stream path.
 *
 * Usage:
 *   node scripts/submit-firefox-amo.js <path-to-zip>
 *
 * Env:
 *   FIREFOX_EXTENSION_ID, FIREFOX_JWT_ISSUER, FIREFOX_JWT_SECRET (required)
 *   FIREFOX_CHANNEL          listed|unlisted (default: listed)
 *   FIREFOX_EXPECTED_VERSION optional; used for idempotent "already on AMO" checks
 *   FIREFOX_POLL_TIMEOUT_MS  validation poll timeout (default: 20m)
 *   FIREFOX_CREATE_RETRIES   create-version attempts (default: 6)
 *
 * Compatibility: every version is created for Firefox and Firefox for Android
 * (min versions from the manifest), then read back; the run fails if AMO has
 * not marked it for both, so Android can't silently drop off the listing.
 */

const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { File } = require('node:buffer');

const AMO_BASE = 'https://addons.mozilla.org/api/v5';
const JWT_TTL_S = 4 * 60; // AMO allows short-lived JWTs; refresh per request
// AMO application names. Shorthand array form: min/max come from the manifest's
// browser_specific_settings.gecko / gecko_android.
const COMPATIBLE_APPS = ['firefox', 'android'];

function requireEnv(name) {
  const value = process.env[name];
  if (!value) {
    console.error(`Missing required env: ${name}`);
    process.exit(1);
  }
  return value;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientNetworkError(err) {
  const msg = `${err?.cause?.message || ''} ${err?.message || ''} ${err?.cause?.code || ''} ${err?.code || ''}`.toLowerCase();
  return (
    msg.includes('other side closed') ||
    msg.includes('econnreset') ||
    msg.includes('econnrefused') ||
    msg.includes('etimedout') ||
    msg.includes('socket hang up') ||
    msg.includes('fetch failed') ||
    msg.includes('undici') ||
    msg.includes('network')
  );
}

function createJwt(issuer, secret) {
  const b64 = (value) => Buffer.from(value).toString('base64url');
  const iat = Math.floor(Date.now() / 1000);
  const payload = {
    iss: issuer,
    jti: crypto.randomUUID(),
    iat,
    exp: iat + JWT_TTL_S,
  };
  const unsigned = `${b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))}.${b64(JSON.stringify(payload))}`;
  const signature = crypto.createHmac('sha256', secret).update(unsigned).digest('base64url');
  return `${unsigned}.${signature}`;
}

function normalizeExtensionId(id) {
  let out = id.trim();
  if (out.startsWith('{')) out = out.slice(1);
  if (out.endsWith('}')) out = out.slice(0, -1);
  return out;
}

async function amoFetch(pathname, { method = 'GET', headers = {}, body, issuer, secret } = {}) {
  const url = pathname.startsWith('http') ? pathname : `${AMO_BASE}${pathname}`;
  const res = await fetch(url, {
    method,
    headers: {
      Authorization: `JWT ${createJwt(issuer, secret)}`,
      ...headers,
    },
    body,
  });
  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = text;
  }
  if (!res.ok) {
    const err = new Error(`AMO ${method} ${pathname} → ${res.status}: ${typeof data === 'string' ? data : JSON.stringify(data)}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

async function listAllVersions(extensionId, issuer, secret) {
  const versions = [];
  let url = `/addons/addon/${encodeURIComponent(extensionId)}/versions/?filter=all_with_unlisted&page_size=50`;
  while (url) {
    const page = await amoFetch(url, { issuer, secret });
    versions.push(...(page.results || []));
    if (!page.next) break;
    url = page.next;
  }
  return versions;
}

async function versionExists(extensionId, version, issuer, secret) {
  if (!version) return false;
  const versions = await listAllVersions(extensionId, issuer, secret);
  return versions.some((v) => v.version === version);
}

function validationSummary(upload) {
  const v = upload?.validation || {};
  return `${v.errors ?? '?'} errors, ${v.warnings ?? '?'} warnings, ${v.notices ?? '?'} notices`;
}

async function uploadZip(zipPath, channel, issuer, secret) {
  const bytes = fs.readFileSync(zipPath);
  const form = new FormData();
  // File (not a streamed Readable) keeps undici from using duplex body mode
  // for the upload request — same class of CI flakiness as create-version.
  form.set(
    'upload',
    new File([bytes], path.basename(zipPath), { type: 'application/zip' }),
  );
  form.set('channel', channel);
  console.log(`Uploading ${path.basename(zipPath)} (${bytes.length} bytes) to channel=${channel}…`);
  return amoFetch('/addons/upload/', {
    method: 'POST',
    issuer,
    secret,
    body: form,
  });
}

async function waitForValidation(uuid, issuer, secret, timeoutMs) {
  const started = Date.now();
  const intervalMs = 8000;
  console.log(`Waiting for validation of upload ${uuid} (timeout ${Math.round(timeoutMs / 60000)}m)…`);
  while (Date.now() - started < timeoutMs) {
    const upload = await amoFetch(`/addons/upload/${encodeURIComponent(uuid)}/`, { issuer, secret });
    if (upload.processed) {
      console.log(`Validation results: ${validationSummary(upload)}`);
      if (!upload.valid) {
        throw new Error(`AMO validation failed (${validationSummary(upload)}): ${JSON.stringify(upload.validation)}`);
      }
      return upload;
    }
    await sleep(intervalMs);
  }
  throw new Error(`Timed out waiting for AMO validation of upload ${uuid}`);
}

async function createVersion(extensionId, uploadUuid, issuer, secret) {
  // JSON body — Mozilla's recommended path when not attaching source.
  // Avoids publish-browser-extension's multipart + empty `source` stream POST
  // that CI hits as undici "other side closed".
  return amoFetch(`/addons/addon/${encodeURIComponent(extensionId)}/versions/`, {
    method: 'POST',
    issuer,
    secret,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ upload: uploadUuid, compatibility: COMPATIBLE_APPS }),
  });
}

// versionRef: numeric id, or `v<version>` to look up by version number.
async function ensureCompatibility(extensionId, versionRef, issuer, secret) {
  const version = await amoFetch(
    `/addons/addon/${encodeURIComponent(extensionId)}/versions/${encodeURIComponent(versionRef)}/`,
    { issuer, secret },
  );
  const compat = version?.compatibility || {};
  const missing = COMPATIBLE_APPS.filter((app) => !compat[app]);
  const summary = Object.entries(compat).map(([app, r]) => `${app} ${r.min}–${r.max}`).join(', ') || 'none';
  console.log(`AMO compatibility for ${version?.version || versionRef}: ${summary}`);
  if (missing.length) {
    throw new Error(
      `AMO version ${version?.version || versionRef} is not marked compatible with: ${missing.join(', ')}. ` +
      'Fix it under Manage Status & Versions on the AMO Developer Hub.',
    );
  }
}

async function createVersionWithRetries({
  extensionId,
  uploadUuid,
  expectedVersion,
  issuer,
  secret,
  retries,
}) {
  let lastError;
  for (let attempt = 1; attempt <= retries; attempt++) {
    console.log(`Create-version attempt ${attempt}/${retries}…`);
    try {
      const version = await createVersion(extensionId, uploadUuid, issuer, secret);
      console.log(`Created AMO version ${version.version} (id=${version.id}).`);
      return version;
    } catch (err) {
      lastError = err;
      console.error(`Create-version attempt ${attempt} failed: ${err.message}`);

      // Version may have been created despite a dropped response.
      if (expectedVersion) {
        try {
          if (await versionExists(extensionId, expectedVersion, issuer, secret)) {
            console.log(`Version ${expectedVersion} is already on AMO — treating as success.`);
            return { version: expectedVersion, recovered: true };
          }
        } catch (checkErr) {
          console.error(`Version existence check failed: ${checkErr.message}`);
        }
      }

      // Upload can only be submitted once; if AMO accepted it, don't keep POSTing.
      if (err.status === 400 || err.status === 409) {
        if (expectedVersion && (await versionExists(extensionId, expectedVersion, issuer, secret))) {
          console.log(`Version ${expectedVersion} exists after ${err.status} — treating as success.`);
          return { version: expectedVersion, recovered: true };
        }
        throw err;
      }

      if (!isTransientNetworkError(err) && err.status && err.status < 500) {
        throw err;
      }

      if (attempt === retries) break;
      const waitMs = Math.min(60_000, 5000 * 2 ** (attempt - 1));
      console.log(`Waiting ${Math.round(waitMs / 1000)}s before retry…`);
      await sleep(waitMs);
    }
  }
  throw lastError;
}

async function main() {
  const zipPath = process.argv[2];
  if (!zipPath) {
    console.error('Usage: node scripts/submit-firefox-amo.js <path-to-zip>');
    process.exit(1);
  }
  if (!fs.existsSync(zipPath)) {
    console.error(`ZIP not found: ${zipPath}`);
    process.exit(1);
  }

  const issuer = requireEnv('FIREFOX_JWT_ISSUER');
  const secret = requireEnv('FIREFOX_JWT_SECRET');
  const extensionId = normalizeExtensionId(requireEnv('FIREFOX_EXTENSION_ID'));
  const channel = process.env.FIREFOX_CHANNEL || 'listed';
  const expectedVersion = process.env.FIREFOX_EXPECTED_VERSION || '';
  const pollTimeoutMs = Number(process.env.FIREFOX_POLL_TIMEOUT_MS || 20 * 60 * 1000);
  const createRetries = Number(process.env.FIREFOX_CREATE_RETRIES || 6);

  console.log(`Firefox extension id: ${extensionId}`);
  if (expectedVersion) {
    if (await versionExists(extensionId, expectedVersion, issuer, secret)) {
      console.log(`Version ${expectedVersion} is already on AMO — nothing to submit.`);
      await ensureCompatibility(extensionId, `v${expectedVersion}`, issuer, secret);
      return;
    }
  }

  // Confirm credentials / addon exist before uploading.
  const addon = await amoFetch(`/addons/addon/${encodeURIComponent(extensionId)}/`, { issuer, secret });
  console.log(`Found add-on: ${addon.name?.['en-US'] || addon.name?.['en-GB'] || addon.slug || extensionId}`);

  const uploaded = await uploadZip(zipPath, channel, issuer, secret);
  const validated = await waitForValidation(uploaded.uuid, issuer, secret, pollTimeoutMs);
  const created = await createVersionWithRetries({
    extensionId,
    uploadUuid: validated.uuid,
    expectedVersion,
    issuer,
    secret,
    retries: createRetries,
  });
  await ensureCompatibility(extensionId, created.id || `v${created.version}`, issuer, secret);

  console.log('Firefox Add-ons submit succeeded.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
