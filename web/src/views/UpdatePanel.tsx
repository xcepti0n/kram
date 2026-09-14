import { useState } from 'react';
import type { UpdateStatus } from '@kram/shared';
import { api, ApiError } from '../api/client.js';
import { useToast } from '../components/Toast.js';
import styles from './UpdatePanel.module.css';

/**
 * Checking is a network round-trip to the git remote, so it happens when the
 * user asks rather than on every render of the settings page. Nothing here
 * polls.
 */
export function UpdatePanel() {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [checking, setChecking] = useState(false);
  const [applying, setApplying] = useState(false);
  /* What to tell the user while the server is away. */
  const [phase, setPhase] = useState<
    'starting' | 'restarting' | 'done' | 'rolled-back' | 'timeout' | null
  >(null);
  const toast = useToast();

  const check = async () => {
    setChecking(true);
    try {
      setStatus(await api.checkUpdates());
    } catch (error) {
      toast.show(error instanceof ApiError ? error.message : 'Could not check for updates', 'error');
    } finally {
      setChecking(false);
    }
  };

  const apply = async () => {
    setApplying(true);
    setPhase('starting');
    try {
      await api.applyUpdate();
      toast.show('Update started', 'success');
      // Stays in the applying state: the server is going down within seconds,
      // and re-enabling the button would invite a second click into it.
      void watchUntilBack(status?.latest ?? null);
    } catch (error) {
      toast.show(error instanceof ApiError ? error.message : 'Could not start the update', 'error');
      setApplying(false);
      setPhase(null);
    }
  };

  /**
   * Follow the restart so the panel can say when it is done.
   *
   * Without this the user gets a toast and then two minutes of silence, with no
   * way to tell a finished update from a broken one except by reloading and
   * guessing. The sequence is: the server stops answering (it is rebuilding),
   * then answers again, and then reports a new commit.
   */
  const watchUntilBack = async (expected: string | null) => {
    const deadline = Date.now() + 10 * 60_000;
    let wentDown = false;

    while (Date.now() < deadline) {
      await new Promise((r) => setTimeout(r, 3000));

      let alive = false;
      try {
        const response = await fetch('/api/health', { cache: 'no-store' });
        alive = response.ok;
      } catch {
        alive = false;
      }

      if (!alive) {
        // Expected: npm ci and the build take the service down.
        wentDown = true;
        setPhase('restarting');
        continue;
      }

      // Answering again. Only trust it once it has actually gone away first,
      // or the very first poll (before systemd has stopped anything) reads as
      // a finished update.
      if (!wentDown) continue;

      try {
        const fresh = await api.checkUpdates();
        if (expected === null || fresh.current === expected || fresh.state === 'up-to-date') {
          setPhase('done');
          setStatus(fresh);
          setApplying(false);
          toast.show('Update complete', 'success');
          return;
        }
        // Back up but still on the old commit: the build failed and update.sh
        // restarted the previous version, which is the rollback working.
        setPhase('rolled-back');
        setApplying(false);
        toast.show('The update did not take — the previous version is running', 'error');
        return;
      } catch {
        // Up but not ready to answer yet; keep waiting.
      }
    }

    setPhase('timeout');
    setApplying(false);
  };

  return (
    <section className={styles.section}>
      <h2 className={styles.heading}>Updates</h2>

      {status === null ? (
        <p className={styles.description}>
          Check whether a newer version has been published.
        </p>
      ) : status.state === 'unknown' ? (
        <p className={styles.description}>
          <span className={styles.unknown}>Could not check.</span> {status.reason}
        </p>
      ) : status.state === 'up-to-date' ? (
        <p className={styles.description}>
          <span className={styles.current}>Up to date.</span>{' '}
          {status.current_subject ? (
            <>Running <code className={styles.sha}>{status.current.slice(0, 7)}</code> — {status.current_subject}</>
          ) : null}
        </p>
      ) : (
        <>
          <p className={styles.description}>
            <span className={styles.behind}>
              {/* behind_by is 0 when the new commits are not in the local object
                  store, which is the normal case: the check uses ls-remote and
                  never fetches. "An update is available" is true either way. */}
              {status.behind_by > 0
                ? `${status.behind_by} ${status.behind_by === 1 ? 'update' : 'updates'} available.`
                : 'An update is available.'}
            </span>
          </p>
          <ul className={styles.commits}>
            {status.commits.slice(0, 10).map((commit) => (
              <li key={commit.sha} className={styles.commit}>
                <code className={styles.sha}>{commit.sha.slice(0, 7)}</code>
                <span className={styles.subject}>{commit.subject}</span>
              </li>
            ))}
          </ul>
          {status.commits.length > 10 ? (
            <p className={styles.more}>…and {status.commits.length - 10} more</p>
          ) : null}
        </>
      )}

      <div className={styles.actions}>
        <button
          type="button"
          className={styles.button}
          onClick={check}
          disabled={checking || applying}
          data-testid="check-updates"
        >
          {checking ? 'Checking…' : 'Check for updates'}
        </button>

        {status?.state === 'behind' && status.can_apply ? (
          <button
            type="button"
            className={styles.primary}
            onClick={apply}
            disabled={applying}
            data-testid="apply-update"
          >
            {applying ? 'Updating…' : 'Update now'}
          </button>
        ) : null}
      </div>

      {/*
        * can_apply is false when kram-update.service is missing or polkit will
        * not let the app start it. Saying so, with the command that does work,
        * is more use than hiding the button and leaving no explanation.
        */}
      {status?.state === 'behind' && !status.can_apply ? (
        <p className={styles.hint}>
          This server cannot apply updates itself. Run{' '}
          <code className={styles.sha}>systemctl start kram-update</code> in the container.
        </p>
      ) : null}

      {/* Say where the update has got to. Two minutes of silence after a click
          is indistinguishable from a failure. */}
      {phase === 'starting' || phase === 'restarting' ? (
        <p className={styles.hint} data-testid="update-progress">
          <span className={styles.spinner} aria-hidden="true" />
          {phase === 'starting'
            ? 'Installing dependencies and rebuilding…'
            : 'Restarting — this page will reconnect on its own.'}
        </p>
      ) : null}

      {phase === 'done' ? (
        <p className={styles.hint} data-testid="update-progress">
          Updated and running the new version.
        </p>
      ) : null}

      {phase === 'rolled-back' ? (
        <p className={styles.hint} data-testid="update-progress">
          The update did not take and the previous version was restored. See{' '}
          <code className={styles.sha}>journalctl -u kram-update</code> for why.
        </p>
      ) : null}

      {phase === 'timeout' ? (
        <p className={styles.hint} data-testid="update-progress">
          Still not back after ten minutes. Check{' '}
          <code className={styles.sha}>journalctl -u kram-update</code> in the container.
        </p>
      ) : null}
    </section>
  );
}
