/**
 * Update checking and triggering.
 *
 * The division of labour matters here: this module only ever *reads* git state
 * and *asks systemd* to run the update. It never pulls, builds or restarts.
 * Those need root, and the app deliberately does not have it — kram.service
 * runs as the `kram` user with an empty capability bounding set. The privileged
 * half lives in kram-update.service, which is a separate unit that root owns.
 *
 * So the worst an attacker who reaches this endpoint can do is make the machine
 * install the code that is already published at the configured remote. That is
 * a real capability and not nothing, but it is a much smaller one than "run
 * arbitrary commands as root", which is what putting the update logic here
 * would have meant.
 */
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';
import type { UpdateCommit, UpdateStatus } from '@kram/shared';

const run = promisify(execFile);

/**
 * Where the checkout lives.
 *
 * Read per call, not once at import. Module-level capture meant a test could
 * only change it by re-importing the module under a cache-busting query, which
 * the bundler refuses — and needing a trick to test something is usually the
 * module telling you it is awkward to use.
 */
const appDir = () => process.env.APP_DIR ?? '/opt/kram';

/**
 * A fetch talks to a remote that may be slow or unreachable. Without a bound
 * the request hangs and the UI spins forever; the caller gets 'unknown' with a
 * reason instead, which is honest and actionable.
 */
const FETCH_TIMEOUT_MS = 20_000;
const GIT_TIMEOUT_MS = 5_000;

async function git(args: string[], timeout = GIT_TIMEOUT_MS): Promise<string> {
  const { stdout } = await run('git', args, { cwd: appDir(), timeout, encoding: 'utf8' });
  return stdout.trim();
}

function unknown(reason: string, current = 'unknown'): UpdateStatus {
  return {
    state: 'unknown',
    current,
    behind_by: 0,
    commits: [],
    checked_at: new Date().toISOString(),
    reason,
    can_apply: false,
  };
}

/**
 * Whether this process can actually trigger an update.
 *
 * Two things have to be true and it is worth checking both. The unit has to
 * exist, and polkit has to permit *this user* to start it — the app runs as
 * `kram`, and `systemctl start` is privileged. Checking only for the file would
 * light up a button that then fails with an authentication error, which is a
 * worse experience than not offering it.
 *
 * `--dry-run` asks systemd to authorise and plan the job without running it, so
 * this is a real permission check and not a guess.
 */
export async function canApply(): Promise<boolean> {
  const installed =
    existsSync('/etc/systemd/system/kram-update.service') ||
    existsSync('/lib/systemd/system/kram-update.service');
  if (!installed) return false;

  try {
    await run('systemctl', ['start', '--dry-run', '--no-block', 'kram-update.service'], {
      timeout: GIT_TIMEOUT_MS,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Compare the checkout against its upstream.
 *
 * `fetch` is a network call, so this is not something to run on a timer from
 * the client. The UI calls it when the user asks.
 */
export async function checkForUpdates(): Promise<UpdateStatus> {
  const dir = appDir();
  if (!existsSync(join(dir, '.git'))) {
    return unknown(`${dir} is not a git checkout — this install was copied in, not cloned.`);
  }

  let current: string;
  let currentSubject: string;
  try {
    current = await git(['rev-parse', 'HEAD']);
    currentSubject = await git(['log', '-1', '--format=%s']);
  } catch (error) {
    return unknown(`could not read the local git state: ${(error as Error).message}`);
  }

  let branch: string;
  try {
    branch = await git(['rev-parse', '--abbrev-ref', 'HEAD']);
    if (branch === 'HEAD') {
      return unknown('the checkout is in a detached HEAD state, so there is no branch to follow.', current);
    }
  } catch {
    return unknown('could not determine the current branch.', current);
  }

  try {
    await git(['fetch', '--quiet', 'origin'], FETCH_TIMEOUT_MS);
  } catch (error) {
    const message = (error as Error & { killed?: boolean }).killed
      ? `could not reach the remote within ${FETCH_TIMEOUT_MS / 1000}s.`
      : `could not fetch from the remote: ${(error as Error).message}`;
    return unknown(message, current);
  }

  let latest: string;
  try {
    latest = await git(['rev-parse', `origin/${branch}`]);
  } catch {
    return unknown(`the branch ${branch} has no upstream on origin.`, current);
  }

  const applicable = await canApply();

  if (current === latest) {
    return {
      state: 'up-to-date',
      current,
      current_subject: currentSubject,
      latest,
      behind_by: 0,
      commits: [],
      checked_at: new Date().toISOString(),
      can_apply: applicable,
    };
  }

  // What is on the remote but not here. A local commit that never got pushed
  // would make this zero while the shas still differ, which is why the state
  // below is driven by the count and not by the inequality above.
  let commits: UpdateCommit[] = [];
  try {
    const log = await git(['log', '--format=%H%x1f%s%x1f%cI', `${current}..${latest}`]);
    commits = log
      ? log.split('\n').map((line) => {
          const [sha, subject, date] = line.split('\x1f');
          return { sha: sha ?? '', subject: subject ?? '', date: date ?? '' };
        })
      : [];
  } catch {
    commits = [];
  }

  if (commits.length === 0) {
    return {
      state: 'up-to-date',
      current,
      current_subject: currentSubject,
      latest,
      behind_by: 0,
      commits: [],
      checked_at: new Date().toISOString(),
      reason: current === latest ? undefined : 'the local checkout has commits that are not on the remote.',
      can_apply: applicable,
    };
  }

  return {
    state: 'behind',
    current,
    current_subject: currentSubject,
    latest,
    behind_by: commits.length,
    commits,
    checked_at: new Date().toISOString(),
    can_apply: applicable,
  };
}

export class UpdateUnavailable extends Error {}

/**
 * Ask systemd to run the update.
 *
 * `--no-block` returns as soon as the job is queued. Waiting would be worse
 * than useless: update.sh restarts kram.service, so the process handling this
 * request is killed partway through and the client sees a dropped connection
 * either way. Returning immediately lets the UI say "started, watch the logs".
 */
export async function startUpdate(): Promise<void> {
  if (!(await canApply())) {
    throw new UpdateUnavailable(
      'kram-update.service is not installed, so the server cannot apply updates itself.',
    );
  }
  try {
    await run('systemctl', ['start', '--no-block', 'kram-update.service'], { timeout: GIT_TIMEOUT_MS });
  } catch (error) {
    throw new UpdateUnavailable(`could not start the update: ${(error as Error).message}`);
  }
}
